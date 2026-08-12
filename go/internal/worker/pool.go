package worker

import (
	"context"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/queue"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
)

// Job represents a single download task.
type Job struct {
	ID    string
	Opts  DownloadOptions
	DlDir string // resolved download directory
}

// Pool manages a pool of workers and coordinates execution.
type Pool struct {
	cfg    *config.Config
	queue  *queue.Queue[Job]
	store  *store.ProgressStore
	sem    chan struct{}
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

// NewPool creates and initializes a new worker pool.
func NewPool(cfg *config.Config, store *store.ProgressStore) *Pool {
	ctx, cancel := context.WithCancel(context.Background())

	return &Pool{
		cfg:    cfg,
		queue:  queue.New[Job](cfg.MaxConcurrentDownloads * 4),
		store:  store,
		sem:    make(chan struct{}, cfg.MaxConcurrentDownloads),
		ctx:    ctx,
		cancel: cancel,
	}
}

// Enqueue adds a job to the pool's queue.
func (p *Pool) Enqueue(job Job) error {
	return p.queue.Enqueue(job)
}

// Start begins processing jobs from the queue.
func (p *Pool) Start() {
	p.wg.Add(1)
	go p.dispatchLoop()

	// Start a cleanup routine
	p.wg.Add(1)
	go p.cleanupLoop()
}

// Stop gracefully shuts down the pool, waiting for active jobs to finish.
func (p *Pool) Stop() {
	p.cancel()
	p.wg.Wait()
}

func (p *Pool) dispatchLoop() {
	defer p.wg.Done()

	for {
		job, err := p.queue.Next(p.ctx)
		if err != nil {
			// Context cancelled
			return
		}

		// Acquire semaphore slot
		select {
		case p.sem <- struct{}{}:
			// Slot acquired
		case <-p.ctx.Done():
			return
		}

		p.wg.Add(1)
		go func(j Job) {
			defer p.wg.Done()
			defer func() { <-p.sem }() // Release semaphore slot

			// Execute the job
			p.processJob(j)
		}(job)
	}
}

func (p *Pool) cleanupLoop() {
	defer p.wg.Done()
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Cleanup old downloads from the store
			p.store.CleanupOldDownloads(1 * time.Hour)
		case <-p.ctx.Done():
			return
		}
	}
}

func (p *Pool) processJob(job Job) {
	worker := NewWorker(job.ID, job.Opts, job.DlDir, p.cfg, p.store)
	worker.Run(p.ctx)
}
