import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Avatar, Button, DropdownMenu } from '@components/ui';
import { Conditional } from '@components/utils';
import { ThemeSwitcher } from '@components/shared';

import { useAuth } from '@hooks/shared';

import { FULL_ROUTES_PATH } from '@routes';

import { Bell, HelpCircle, LogOut, Settings, User } from 'lucide-react';
import { cn } from '@utils';

// ─── EN / AR language toggle ──────────────────────────────────────────────────

function LanguageToggle() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('ar') ? 'ar' : 'en';

  const langs: { value: string; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'ar', label: 'AR' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="inline-flex items-center gap-0.5 rounded-lg bg-primary-15 p-0.5"
    >
      {langs.map(({ value, label }) => {
        const active = currentLang === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => i18n.changeLanguage(value)}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function DashboardHeader() {
  const navigate = useNavigate();
  const { currentUser, removeCurrentUser } = useAuth();

  const handleNavigateToProfile = () => {
    if (!currentUser?.userId) return;
    navigate(FULL_ROUTES_PATH.HOME.INDEX);
  };

  return (
    <header className="bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-muted-200 px-4 backdrop-blur-xl md:px-6 lg:px-8">
      {/* Left Section */}
      <div className="flex flex-1 items-center gap-3 overflow-hidden" />

      {/* Right Section: Actions */}
      <div className="flex items-center gap-1">
        {/* Language toggle */}
        <LanguageToggle />

        {/* Separator */}
        <div className="bg-border mx-1 hidden h-5 w-px md:block" />

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>

        {/* Help/Support */}
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-9 w-9" aria-label="Help">
          <HelpCircle className="h-4 w-4" />
        </Button>

        {/* Theme Switcher */}
        <ThemeSwitcher />

        {/* Separator */}
        <div className="bg-border mx-1 hidden h-5 w-px md:block" />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0" aria-label="Open user menu">
              <Avatar className="ring-primary/20 h-8 w-8 ring-2 transition-all hover:ring-2">
                <Conditional.If condition={!!currentUser?.picture}>
                  <Avatar.Image src={currentUser?.picture} alt="User avatar" />
                </Conditional.If>

                <Avatar.Fallback className="bg-primary/10 text-primary text-xs font-medium">
                  <Conditional>
                    <Conditional.If condition={!!currentUser?.name}>
                      {currentUser?.name?.charAt(0)?.toUpperCase()}
                    </Conditional.If>

                    <Conditional.Else>
                      <User className="h-3.5 w-3.5" />
                    </Conditional.Else>
                  </Conditional>
                </Avatar.Fallback>
              </Avatar>
            </Button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Content className="w-56" align="end" forceMount>
            <DropdownMenu.Label className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm leading-none font-medium">{currentUser?.name}</p>

                <p className="text-muted text-xs leading-none">{currentUser?.email}</p>
              </div>
            </DropdownMenu.Label>

            <DropdownMenu.Separator />

            <DropdownMenu.Group>
              <DropdownMenu.Item onClick={handleNavigateToProfile}>
                <User className="me-2 h-4 w-4" />
                My profile
              </DropdownMenu.Item>

              <DropdownMenu.Item>
                <Settings className="me-2 h-4 w-4" />
                Settings
              </DropdownMenu.Item>
            </DropdownMenu.Group>

            <DropdownMenu.Separator />

            <DropdownMenu.Item onClick={removeCurrentUser}>
              <LogOut className="me-2 h-4 w-4" />
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default DashboardHeader;
