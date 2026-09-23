import { useEffect } from 'react'
import welcomeImage from '../assets/secondlife-welcome.png'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../components/ui/Card'
import { useAppHealthStore } from '../stores/app-health-store'
import type { CapabilityCategory, ScannerCapability } from '../../shared/types'

// Render order + i18n label key for each app-area group.
const CATEGORY_ORDER: { id: CapabilityCategory; labelKey: string }[] = [
  { id: 'scan', labelKey: 'dashboard.categoryScan' },
  { id: 'manual', labelKey: 'dashboard.categoryManual' },
  { id: 'utilities', labelKey: 'dashboard.categoryUtilities' },
  { id: 'export', labelKey: 'dashboard.categoryExport' }
]

export function Dashboard() {
  const { t } = useTranslation()
  const { osInfo, capabilities, initialize } = useAppHealthStore()

  useEffect(() => {
    initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const supported = capabilities.filter((c) => c.supported)
  const total = capabilities.length
  const ratio = total > 0 ? (supported.length / total) * 100 : 0
  const allReady = total > 0 && supported.length === total

  // Group capabilities by app area, preserving CATEGORY_ORDER and dropping
  // empty groups. Inside each group, supported checks come first.
  const groups = CATEGORY_ORDER.map(({ id, labelKey }) => {
    const items = capabilities
      .filter((c) => c.category === id)
      .sort((a, b) => Number(b.supported) - Number(a.supported))
    return { id, labelKey, items }
  }).filter((g) => g.items.length > 0)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="animate-fade-in">
        {/* Welcome Card — luminous hero */}
        <Card className="mb-4 relative overflow-hidden" transition={{ duration: 0.4 }}>
          {/* Gradient-mesh atmosphere */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-40 animate-blob-1"
              style={{ background: 'radial-gradient(circle, rgba(206,181,255,0.40), transparent 70%)' }}
            />
            <div
              className="absolute -bottom-24 -left-12 w-72 h-72 rounded-full blur-3xl opacity-30 animate-blob-2"
              style={{ background: 'radial-gradient(circle, rgba(128,168,255,0.35), transparent 70%)' }}
            />
          </div>

          <CardContent className="relative">
            <div className="flex items-center gap-4">
              {/* Emblem */}
              <div
                className="shrink-0 w-14 h-14 rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(206,181,255,0.20), rgba(128,168,255,0.20))',
                  boxShadow: '0 0 28px rgba(128,168,255,0.28)',
                  border: '1px solid rgba(206,181,255,0.25)'
                }}
              >
                <img
                  src={welcomeImage}
                  alt="Secondlife"
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Heading */}
              <div className="min-w-0">
                <p className="text-2xs font-semibold tracking-[0.22em] text-text-muted">
                  {t('dashboard.eyebrow')}
                </p>
                <h1 className="text-3xl font-bold leading-tight theme-gradient-text inline-block">
                  {t('dashboard.welcome')}
                </h1>
                <p className="text-sm text-text-secondary mt-0.5">
                  {t('dashboard.welcomeMessage')}
                </p>
              </div>
            </div>

            {/* Neutral badge */}
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background-elevated/40 px-3 py-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse-slow"
                style={{ background: 'var(--theme-accent-2)', boxShadow: '0 0 8px var(--theme-accent-2)' }}
              />
              <span className="text-2xs font-bold tracking-[0.18em] text-text-secondary">
                {t('dashboard.madeForSecondlife')}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* System Compatibility Card */}
        {total > 0 && (
          <Card>
            <CardContent>
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text-primary">
                    {t('dashboard.compatibility')}
                  </h2>
                  <p className="text-xs text-text-secondary mt-0.5 truncate">
                    {allReady
                      ? t('dashboard.allChecksAvailable')
                      : t('dashboard.someChecksUnavailable')}
                    {osInfo ? ` · ${osInfo.displayName}` : ''}
                  </p>
                </div>
                <div
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums ${
                    allReady ? 'bg-success/10 text-success' : 'bg-aurora-blue/10 text-aurora-blue'
                  }`}
                >
                  {supported.length}/{total}
                </div>
              </div>

              {/* Availability bar */}
              <div className="h-1.5 w-full rounded-full bg-background-elevated overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${ratio}%`,
                    background: 'linear-gradient(90deg, var(--theme-accent-1), var(--theme-accent-2))'
                  }}
                />
              </div>

              {/* Capability groups, one section per app area / tab */}
              <div className="space-y-4">
                {groups.map((group) => {
                  const groupReady = group.items.filter((c) => c.supported).length
                  return (
                    <div key={group.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-2xs font-bold tracking-[0.18em] uppercase text-text-muted">
                          {t(group.labelKey)}
                        </h3>
                        <span className="text-2xs font-semibold tabular-nums text-text-muted/70">
                          {groupReady}/{group.items.length}
                        </span>
                        <span className="flex-1 h-px bg-border" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.items.map((cap) => (
                          <CapabilityChip key={cap.id} cap={cap} ready={cap.supported} t={t} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

interface CapabilityChipProps {
  cap: ScannerCapability
  ready: boolean
  t: (key: string) => string
}

function CapabilityChip({ cap, ready, t }: CapabilityChipProps) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
        ready
          ? 'border-success/20 bg-success/5'
          : 'border-border bg-background-elevated/40'
      }`}
      title={ready ? cap.description : cap.reason || cap.description}
    >
      <div
        className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
          ready ? 'bg-success/15 text-success' : 'bg-text-muted/10 text-text-muted'
        }`}
      >
        {ready ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${ready ? 'text-text-primary' : 'text-text-muted'}`}>
          {cap.name}
        </p>
        <p className="text-[11px] text-text-secondary truncate">
          {ready ? t('dashboard.ready') : cap.reason || t('dashboard.unavailable')}
        </p>
      </div>
    </div>
  )
}
