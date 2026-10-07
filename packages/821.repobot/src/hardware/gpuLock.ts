import fs from 'node:fs'
import path from 'node:path'

export interface GpuMutexOptions {
    lockFilePath?: string
    flockBinding?: {
        lock: (fd: number) => boolean
        unlock: (fd: number) => void
    }
}

export class GpuHardwareMutex {
    private lockFd: number | null = null
    private readonly lockFilePath: string
    private readonly flockBinding?: {
        lock: (fd: number) => boolean
        unlock: (fd: number) => void
    }

    constructor(options: GpuMutexOptions = {}) {
        this.lockFilePath = options.lockFilePath || '/var/lock/rig2_gpu.lock'
        this.flockBinding = options.flockBinding
    }

    /**
     * Attempts to acquire an exclusive, non-blocking lock on the physical GPU interface.
     * Corresponds to OS-level system call: flock(fd, LOCK_EX | LOCK_NB).
     */
    public acquireLock(): boolean {
        if (this.lockFd !== null) {
            return true // Lock already held by this broker instance
        }

        try {
            const dir = path.dirname(this.lockFilePath)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }

            // If a custom native binding is provided, utilize OS flock semantics
            if (this.flockBinding) {
                this.lockFd = fs.openSync(this.lockFilePath, 'w')
                const acquired = this.flockBinding.lock(this.lockFd)
                if (!acquired) {
                    fs.closeSync(this.lockFd)
                    this.lockFd = null
                    return false
                }
                return true
            }

            // Portable Node.js non-blocking atomic file lock fallback (O_CREAT | O_EXCL)
            this.lockFd = fs.openSync(
                this.lockFilePath,
                fs.constants.O_CREAT |
                    fs.constants.O_EXCL |
                    fs.constants.O_RDWR,
            )
            return true
        } catch (err: any) {
            if (
                err.code === 'EAGAIN' ||
                err.code === 'EWOULDBLOCK' ||
                err.code === 'EEXIST'
            ) {
                if (this.lockFd !== null) {
                    try {
                        fs.closeSync(this.lockFd)
                    } catch {}
                    this.lockFd = null
                }
                return false // Hardware actively occupied by a local process
            }

            throw new Error(
                `[GpuMutex] Kernel failure acquiring GPU lock at '${this.lockFilePath}': ${err.message}`,
            )
        }
    }

    /**
     * Releases the OS file lock and closes the file descriptor.
     */
    public releaseLock(): void {
        if (this.lockFd === null) {
            return
        }

        try {
            if (this.flockBinding) {
                this.flockBinding.unlock(this.lockFd)
            }
        } catch {
            // Ignore unlock errors during teardown
        } finally {
            try {
                fs.closeSync(this.lockFd)
            } catch {}

            // Remove atomic lockfile if portable fallback was used
            if (!this.flockBinding && fs.existsSync(this.lockFilePath)) {
                try {
                    fs.unlinkSync(this.lockFilePath)
                } catch {}
            }

            this.lockFd = null
            console.log(
                '>> [MUTEX:RELEASE] Released GPU hardware file descriptor lock [OK]',
            )
        }
    }

    public isLocked(): boolean {
        return this.lockFd !== null
    }

    public getLockFilePath(): string {
        return this.lockFilePath
    }
}
