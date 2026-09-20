package process

import (
	"fmt"
	"os/exec"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func prepare(cmd *exec.Cmd) (func() error, func(), error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil { return nil, nil, err }
	cleanup := func() { _ = windows.CloseHandle(job) }
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	_, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)))
	if err != nil { cleanup(); return nil,nil,err }
	// Assignment precedes execution, so children cannot escape the job during startup.
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow:true, CreationFlags:windows.CREATE_SUSPENDED}
	cmd.Cancel = func() error { return windows.TerminateJobObject(job, 1) }
	afterStart := func() error {
		pid := uint32(cmd.Process.Pid)
		p, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, pid)
		if err != nil { return err }
		defer windows.CloseHandle(p)
		if err = windows.AssignProcessToJobObject(job,p); err != nil { return err }
		snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPTHREAD,0)
		if err != nil { return err }
		defer windows.CloseHandle(snapshot)
		entry := windows.ThreadEntry32{}
		entry.Size = uint32(unsafe.Sizeof(entry))
		for err = windows.Thread32First(snapshot,&entry); err == nil; err = windows.Thread32Next(snapshot,&entry) {
			if entry.OwnerProcessID != pid { continue }
			thread, err := windows.OpenThread(windows.THREAD_SUSPEND_RESUME,false,entry.ThreadID)
			if err != nil { return err }
			_, err = windows.ResumeThread(thread)
			windows.CloseHandle(thread)
			return err
		}
		return fmt.Errorf("could not resume downloader process: %w",err)
	}
	return afterStart, cleanup, nil
}
