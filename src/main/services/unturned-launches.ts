import { execFile } from 'child_process'
import { join } from 'path'
import { z } from 'zod'
import { buildUnturnedLaunchResult } from './unturned-launch-model'
import { UNTURNED_LAUNCH_SCRIPT } from './unturned-launch-script'
import type { UnturnedLaunchResult } from '../../shared/types'

const sourceSchema = z.enum(['Running processes', 'Security 4688', 'Sysmon 1'])
const recordSchema = z.object({
  name: z.string(), path: z.string(), pid: z.number().int().nonnegative(),
  startedAt: z.number().finite(), source: sourceSchema
})
const snapshotSchema = z.object({
  checkedAt: z.number().finite(), liveAvailable: z.boolean(),
  unknownLivePids: z.array(z.number().int().nonnegative()),
  live: z.array(recordSchema), game: recordSchema.nullable(), history: z.array(recordSchema),
  logs: z.array(z.object({
    source: sourceSchema, status: z.enum(['available', 'empty', 'unavailable', 'limited']), message: z.string()
  })),
  warnings: z.array(z.string())
})

export async function findUnturnedLaunches(): Promise<UnturnedLaunchResult> {
  if (process.platform !== 'win32') throw new Error('Unturned Launches is available on Windows only.')
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const encoded = Buffer.from(UNTURNED_LAUNCH_SCRIPT, 'utf16le').toString('base64')
  const output = await new Promise<string>((resolve, reject) => {
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 24 * 1024 * 1024
    }, (error, stdout) => {
      if (error) {
        reject(new Error(error.killed
          ? 'Reading launch history timed out. Try again while Unturned is running.'
          : 'Unable to read process launch information from Windows.'))
      } else resolve(stdout)
    })
  })
  const parsed = snapshotSchema.safeParse(JSON.parse(output.trim().replace(/^\uFEFF/, '')))
  if (!parsed.success) throw new Error('Windows returned an unexpected process history format.')
  return buildUnturnedLaunchResult(parsed.data)
}
