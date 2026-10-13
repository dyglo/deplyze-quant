import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Settings,
  LineChart,
  MessageSquare,
  Activity,
  TrendingUp,
  Library,
  History,
  Sparkles,
  Compass,
  Home,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Check,
  Newspaper,
  Sun,
  Moon,
  Flame,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

/*
 * Main navigation, grouped into cognitive sections (Discover / Research /
 * Library / Data). Market Dashboards retain their own
 * collapsible groups rendered inline. Section grouping is presentation-only —
 * routes are unchanged. `menuItems` is derived below to preserve the existing
 * active-tab / breadcrumb lookups.
 */
// Top-level Home entry (Market Home). Rendered standalone above the sections;
// included in `menuItems` below so active-tab / breadcrumb lookups resolve "/".
const HOME_ITEM = { id: 'home', label: 'Home', icon: Home, path: '/' };

const DISCOVER_ITEMS = [
  { id: 'macro',       label: 'Macro Regime Desk',      icon: TrendingUp,      path: '/macro' },
];

const RESEARCH_ITEMS = [
  { id: 'history',     label: 'Historical Intelligence', icon: History, path: '/historical-intelligence' },
  { id: 'research',    label: 'Deep Research',           icon: Compass,        path: '/research' },
];

const LIBRARY_ITEMS = [
  { id: 'library',     label: 'Research Library',       icon: Library,         path: '/library' },
];

const menuItems = [HOME_ITEM, ...DISCOVER_ITEMS, ...RESEARCH_ITEMS, ...LIBRARY_ITEMS];

const bottomItems = [
  { id: 'settings',   label: 'Settings & Account', icon: Settings,        path: '/settings' },
];

const MARKET_DASHBOARD_ITEMS = [
  { id: 'global-yields', label: 'Global Yields',              icon: TrendingUp,     path: '/market/global-yields' },
  { id: 'commodities',   label: 'Commodities',                icon: Flame,          path: '/market/commodities' },
];

/* ─── Section label for grouped main nav (presentation-only) ───── */
const NavSectionLabel: React.FC<{ children: React.ReactNode; collapsed: boolean; first?: boolean }> = ({ children, collapsed, first }) => {
  if (collapsed) {
    // No text label in icon-only mode; a thin divider separates sections.
    return first ? null : <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '6px 4px' }} />;
  }
  return (
    <p style={{
      fontSize: '0.5625rem',
      fontWeight: 700,
      color: 'var(--muted-foreground)',
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      padding: '0 0.625rem',
      margin: first ? '0 0 0.3rem' : '0.7rem 0 0.3rem',
      userSelect: 'none',
    }}>
      {children}
    </p>
  );
};

/* ─── Inner nav content extracted so it can call useSidebar ────── */
const SidebarInner: React.FC = () => {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();



  const isMarketRoute = location.pathname.startsWith('/market/');
  const [mdOpen, setMdOpen] = useState(() => {
    const stored = localStorage.getItem('market-dashboards-expanded');
    return stored === null ? false : stored === 'true';
  });

  useEffect(() => {
    if (isMarketRoute && !mdOpen) {
      setMdOpen(true);
      localStorage.setItem('market-dashboards-expanded', 'true');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketRoute]);

  const toggleMd = () => {
    const next = !mdOpen;
    setMdOpen(next);
    localStorage.setItem('market-dashboards-expanded', String(next));
  };

    const onMarketClick = () => {

    toggleMd();
  };
      const mdExpanded = mdOpen;

  const currentTab = menuItems.find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  )?.id || (location.pathname.startsWith('/settings') ? 'settings' : 'dashboard');

  const initials = 'D';

  // Shared renderer for a flat (non-collapsible) main-nav item.
  const renderNavItem = (item: typeof menuItems[number]) => {
    const active = currentTab === item.id;
    const baseStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: '0.625rem',
      padding: '0.4375rem 0.625rem',
      borderRadius: '0.375rem',
      fontSize: '0.8125rem',
      fontWeight: active ? 500 : 400,
      color: active ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-foreground)',
      opacity: active ? 1 : 0.8,
      background: active ? 'var(--sidebar-accent)' : 'transparent',
      border: active ? '1px solid var(--sidebar-border)' : '1px solid transparent',
      width: '100%',
      textDecoration: 'none',
    };
    const hoverIn = (e: React.MouseEvent) => {
      if (!active) {
        (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-accent)';
        (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-accent-foreground)';
      }
    };
    const hoverOut = (e: React.MouseEvent) => {
      if (!active) {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
        (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-foreground)';
      }
    };
    const icon = (
      <item.icon
        size={15}
        style={{ color: active ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)', opacity: active ? 1 : 0.6, flexShrink: 0 }}
      />
    );



    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          render={(props) => <Link {...props} to={item.path} />}
          isActive={active}
          tooltip={collapsed ? item.label : undefined}
          className="ds-transition-fast"
          style={baseStyle}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          {icon}
          {!collapsed && <span>{item.label}</span>}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0 select-none" style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Dynamic Workspace & Project Selectors */}
      <SidebarHeader className="px-3 py-3" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-3.5 py-1">
            <Link
              to="/"
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              title="Deplyze Quant — Market Home"
            >
              <Activity size={14} />
            </Link>
            
            <div 
              className="w-6 h-6 rounded bg-light border border-divider flex items-center justify-center text-[10px] font-semibold text-secondary-foreground cursor-pointer hover:bg-light-hover" 
              title="Deplyze Quant"
              onClick={() => {}}
            >
              D
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-1 relative">
            {/* Logo Row → Market Home */}
            <Link to="/" className="flex items-center gap-2 px-0.5" style={{ textDecoration: 'none' }} title="Deplyze Quant — Market Home">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Activity size={12} />
              </div>
              <div className="overflow-hidden flex-1">
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                  Deplyze Quant
                </p>
              </div>
            </Link>


          </div>
        )}
      </SidebarHeader>

      {/* Main nav */}
      <SidebarContent className="px-2 py-3 flex-1">
        {/* ── Home (top-level) ─────────────────────────────── */}
        <SidebarMenu className="gap-0.5">
          {renderNavItem(HOME_ITEM)}
        </SidebarMenu>

        {/* ── Discover ─────────────────────────────────────── */}
        <NavSectionLabel collapsed={collapsed}>Discover</NavSectionLabel>
        <SidebarMenu className="gap-0.5">
          {DISCOVER_ITEMS.map(renderNavItem)}
        </SidebarMenu>

        {/* ── Market Dashboards expandable group (Discover) ──── */}
        <div style={{ marginTop: 4 }}>
          {/* Divider */}
          <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '4px 4px 6px' }} />

          {collapsed ? (
            /* Icon-only mode: show group icon with tooltip */
            <div
              title="Market Dashboards"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.4375rem',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                background: isMarketRoute ? 'var(--sidebar-accent)' : 'transparent',
                border: isMarketRoute ? '1px solid var(--sidebar-border)' : '1px solid transparent',
              }}
              onClick={onMarketClick}
            >
              <LayoutDashboard
                size={15}
                style={{
                  color: isMarketRoute ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)',
                  opacity: isMarketRoute ? 1 : 0.6,
                }}
              />
            </div>
          ) : (
            <>
              {/* Group header button */}
              <button
                onClick={onMarketClick}
                aria-expanded={mdOpen}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.4rem 0.625rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: isMarketRoute ? 'var(--sidebar-accent)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isMarketRoute) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-accent)';
                }}
                onMouseLeave={(e) => {
                  if (!isMarketRoute) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <LayoutDashboard
                  size={15}
                  style={{
                    color: isMarketRoute ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)',
                    opacity: isMarketRoute ? 1 : 0.6,
                    flexShrink: 0,
                  }}
                />
                <span style={{
                  flex: 1,
                  fontSize: '0.8125rem',
                  fontWeight: isMarketRoute ? 500 : 400,
                  color: isMarketRoute ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-foreground)',
                  opacity: isMarketRoute ? 1 : 0.8,
                  letterSpacing: '-0.01em',
                }}>
                  Market Dashboards
                </span>
                {/* Active child indicator dot */}
                {isMarketRoute && !mdOpen && (
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--sidebar-primary)',
                    flexShrink: 0,
                  }} />
                )}
                <span style={{
                  display: 'flex',
                  transition: 'transform 200ms ease',
                  transform: mdOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  color: 'var(--muted-foreground)',
                  flexShrink: 0,
                }}>
                  <ChevronRight size={13} />
                </span>
              </button>

              {/* Group children */}
              {mdExpanded && (
                <div style={{ marginTop: 2, paddingLeft: 8 }}>
                  {MARKET_DASHBOARD_ITEMS.map((item) => {
                    const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          render={(props) => <Link {...props} to={item.path} />}
                          isActive={active}
                          tooltip={undefined}
                          className="ds-transition-fast"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.375rem 0.5rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            fontWeight: active ? 500 : 400,
                            color: active ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-foreground)',
                            opacity: active ? 1 : 0.75,
                            background: active ? 'var(--sidebar-accent)' : 'transparent',
                            border: active ? '1px solid var(--sidebar-border)' : '1px solid transparent',
                            width: '100%',
                            textDecoration: 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-accent)';
                              (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-accent-foreground)';
                              (e.currentTarget as HTMLElement).style.opacity = '1';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                              (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-foreground)';
                              (e.currentTarget as HTMLElement).style.opacity = '0.75';
                            }
                          }}
                        >
                          <item.icon
                            size={13}
                            style={{
                              color: active ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)',
                              opacity: active ? 1 : 0.5,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ lineHeight: 1.2 }}>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Research ─────────────────────────────────────── */}
        <NavSectionLabel collapsed={collapsed}>Research</NavSectionLabel>
        <SidebarMenu className="gap-0.5">
          {RESEARCH_ITEMS.map(renderNavItem)}
        </SidebarMenu>

        {/* ── Library ──────────────────────────────────────── */}
        <NavSectionLabel collapsed={collapsed}>Library</NavSectionLabel>
        <SidebarMenu className="gap-0.5">
          {LIBRARY_ITEMS.map(renderNavItem)}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer: Settings Navigation */}
      <SidebarFooter className="px-2 pb-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <div style={{ paddingTop: '0.75rem' }}>

          <Link
            to="/settings"
            className="ds-transition-fast"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? '0' : '0.625rem',
              padding: collapsed ? '0.375rem' : '0.5rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              background: location.pathname.startsWith('/settings') ? 'var(--sidebar-accent)' : 'transparent',
              border: location.pathname.startsWith('/settings') ? '1px solid var(--sidebar-border)' : '1px solid transparent',
              cursor: 'pointer',
              width: '100%',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => {
              if (!location.pathname.startsWith('/settings')) {
                (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-accent)';
              }
            }}
            onMouseLeave={(e) => {
              if (!location.pathname.startsWith('/settings')) {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }
            }}
            title={collapsed ? "Settings" : undefined}
          >
            {/* App mark */}
              <div style={{
                width: '1.875rem',
                height: '1.875rem',
                borderRadius: '50%',
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                border: '1px solid var(--sidebar-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                flexShrink: 0,
                overflow: 'hidden',
              }}>
                {initials}
              </div>

            {/* Settings navigation */}
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                <p style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--sidebar-foreground)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.2'
                }}>
                  Settings
                </p>
                <p style={{
                  fontSize: '0.625rem',
                  color: 'var(--sidebar-foreground)',
                  opacity: 0.6,
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.2'
                }}>
                  Research preferences
                </p>
              </div>
            )}

            {/* Settings gear icon on the right */}
            {!collapsed && (
              <Settings
                size={14}
                style={{
                  color: 'var(--sidebar-foreground)',
                  opacity: 0.5,
                  flexShrink: 0,
                  marginLeft: 'auto',
                }}
              />
            )}
          </Link>

        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const currentPage = [...menuItems, ...bottomItems, ...MARKET_DASHBOARD_ITEMS].find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  return (
    <SidebarProvider defaultOpen={true}>
      <div style={{ display: 'flex', height: '100vh', width: '100%', background: 'var(--background)', color: 'var(--foreground)', overflow: 'hidden' }}>
        <SidebarInner />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* Top bar */}
          <header style={{
            height: '52px',
            background: 'var(--background)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1.25rem',
            justifyContent: 'space-between',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <SidebarTrigger
                className="ds-transition-fast"
                style={{
                  width: '1.75rem',
                  height: '1.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>

                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.1875rem 0.5rem', borderRadius: '0.25rem',
                    background: 'var(--secondary)', border: '1px solid var(--border)',
                    fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)',
                  }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Public</span>
                    <span>Market</span>
                  </div>


                <span style={{ color: 'var(--muted-foreground)', opacity: 0.6, fontFamily: 'monospace', fontSize: '0.75rem', userSelect: 'none' }}>/</span>

                <span style={{ fontWeight: 500, color: 'var(--primary)' }}>
                  {currentPage?.label || 'Dashboard'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Deplyze Assistant (Copilot) */}
              <Link
                to="/copilot"
                title="Deplyze Assistant — context-aware research copilot"

                className="ds-transition-fast"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.25rem 0.625rem',
                  height: '1.75rem',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: location.pathname.startsWith('/copilot')
                    ? 'color-mix(in srgb, var(--primary) 40%, transparent)'
                    : 'var(--border)',
                  background: location.pathname.startsWith('/copilot')
                    ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                    : 'var(--card)',
                  color: location.pathname.startsWith('/copilot')
                    ? 'var(--primary)'
                    : 'var(--foreground)',
                  textDecoration: 'none',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
                onMouseEnter={(e) => {
                  if (!location.pathname.startsWith('/copilot')) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--muted)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!location.pathname.startsWith('/copilot')) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--card)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--foreground)';
                  }
                }}
              >
                <Sparkles size={12} style={{ color: 'var(--primary)' }} />
                <span>Deplyze Assistant</span>
              </Link>

              {/* Theme Toggle Button */}
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="ds-transition-fast cursor-pointer p-1 rounded-md border border-divider flex items-center justify-center"
                style={{
                  background: 'var(--card)',
                  borderColor: 'var(--border)',
                  color: 'var(--muted-foreground)',
                  width: '1.75rem',
                  height: '1.75rem',
                }}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--muted)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--card)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)';
                }}
              >
                {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
              </button>



            </div>
          </header>

          {/* Page content */}
          <div style={{ 
            flex: 1, 
            overflow: location.pathname.startsWith('/copilot') ? 'hidden' : 'auto', 
            minHeight: 0 
          }}>
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};
