package worker

import (
	"context"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/queue"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

// Job represents a single download task.
type Job struct {
	ID    string
	Opts  DownloadOptions
	DlDir string      // resolved download directory
	Built BuildResult // validated before admission
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
	if err := p.ctx.Err(); err != nil {
		return err
	}
	return p.queue.Enqueue(job)
}

func (p *Pool) EnqueueWait(ctx context.Context, job Job) error {
	combined, cancel := context.WithCancel(ctx)
	defer cancel()
	stop := context.AfterFunc(p.ctx, cancel)
	defer stop()
	return p.queue.EnqueueWait(combined, job)
}

// RemoveQueued cancels admission for a job that has not yet been claimed by a
// worker. The caller remains responsible for updating the download state.
func (p *Pool) RemoveQueued(id string) bool {
	return p.queue.Remove(func(job Job) bool { return job.ID == id })
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
			p.store.CleanupOldDownloads(7 * 24 * time.Hour)
			p.store.TrimHistory(200)
		case <-p.ctx.Done():
			return
		}
	}
}

func (p *Pool) processJob(job Job) {
	worker := NewWorker(job.ID, job.Opts, job.DlDir, p.cfg, p.store)
	worker.Built = job.Built
	worker.Run(p.ctx)
}
