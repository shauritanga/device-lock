import { Moon, Sun } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useTheme } from '../theme/ThemeContext';
import { cn } from '../lib/cn';

/** App preferences shared by both consoles. */
export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">Appearance and account preferences.</p>
      </div>

      <Card className="p-6">
        <p className="text-sm font-semibold text-ink">Theme</p>
        <p className="mt-0.5 text-xs text-muted">Choose light or dark mode for this browser.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition',
              theme === 'light'
                ? 'border-brand-400 bg-brand-50 text-brand-800'
                : 'border-line bg-canvas text-ink hover:border-brand-200',
            )}
          >
            <Sun className="h-4 w-4" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition',
              theme === 'dark'
                ? 'border-brand-400 bg-brand-900/40 text-brand-100'
                : 'border-line bg-canvas text-ink hover:border-brand-200',
            )}
          >
            <Moon className="h-4 w-4" />
            Dark
          </button>
        </div>
      </Card>
    </div>
  );
}
