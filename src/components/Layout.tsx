import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Settings,
  LogOut,
  LineChart,
  MessageSquare,
  Activity,
  TrendingUp,
  BarChart3,
  Network,
  Database,
  Beaker,
  FileText,
  FlaskConical,
  Library,
  History,
  Sparkles,
  Compass,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Check,
  Plus,
  Settings2,
  Building2,
  MapPin,
  Newspaper,
  Sun,
  Moon,
  MoreVertical,
  Edit2,
  Trash2,
  Globe,
  Map,
  Flame,
  ArrowLeftRight,
  Briefcase,
  ListTree,
  PieChart,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useWorkspace } from './WorkspaceContext';
import {
  CreateWorkspaceModal,
  CreateProjectModal,
  WorkspaceSettingsModal,
} from './WorkspaceModals';
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
 * Library / Data). Portfolio and Market Dashboards remain their own
 * collapsible groups rendered inline. Section grouping is presentation-only —
 * routes are unchanged. `menuItems` is derived below to preserve the existing
 * active-tab / breadcrumb lookups.
 */
const DISCOVER_ITEMS = [
  { id: 'terminal',    label: 'Intelligence Terminal',  icon: Activity,        path: '/terminal' },
  { id: 'macro',       label: 'Macro Regime Desk',      icon: TrendingUp,      path: '/macro' },
  { id: 'relations-map', label: 'Relations Map',        icon: Network,         path: '/relations-map' },
];

const RESEARCH_ITEMS = [
  { id: 'history',     label: 'Historical Intelligence Terminal', icon: History, path: '/historical-intelligence' },
  { id: 'research',    label: 'Historical Research',     icon: Compass,        path: '/research' },
  { id: 'lab',         label: 'Quant Lab',              icon: Beaker,          path: '/lab' },
  { id: 'backtesting', label: 'Backtesting',            icon: FlaskConical,    path: '/backtesting' },
];

const LIBRARY_ITEMS = [
  { id: 'library',     label: 'Research Library',       icon: Library,         path: '/library' },
  { id: 'briefings',   label: 'Briefings',              icon: FileText,        path: '/briefings' },
];

const DATA_ITEMS = [
  { id: 'warehouse',   label: 'Data Warehouse',         icon: Database,        path: '/warehouse' },
];

const menuItems = [...DISCOVER_ITEMS, ...RESEARCH_ITEMS, ...LIBRARY_ITEMS, ...DATA_ITEMS];

const bottomItems = [
  { id: 'settings',   label: 'Settings & Account', icon: Settings,        path: '/settings' },
];

const MARKET_DASHBOARD_ITEMS = [
  { id: 'world-equity',  label: 'World Equity Intelligence',  icon: Globe,          path: '/market/world-equity' },
  { id: 'us-sectors',    label: 'US Sector Intelligence',     icon: BarChart3,      path: '/market/us-sectors' },
  { id: 'global-yields', label: 'Global Yields',              icon: TrendingUp,     path: '/market/global-yields' },
  { id: 'countries',     label: 'Countries & Regional',       icon: Map,            path: '/market/countries' },
  { id: 'commodities',   label: 'Commodities Intelligence',   icon: Flame,          path: '/market/commodities' },
  { id: 'fx-liquidity',  label: 'FX & Liquidity',             icon: ArrowLeftRight, path: '/market/fx-liquidity' },
];

const PORTFOLIO_INTELLIGENCE_ITEMS = [
  { id: 'portfolio-overview',   label: 'Portfolio Overview',        icon: LayoutDashboard, path: '/portfolio/overview' },
  { id: 'portfolio-holdings',   label: 'Holdings & Watchlist',      icon: ListTree,        path: '/portfolio/holdings' },
  { id: 'portfolio-exposure',   label: 'Exposure Analysis',         icon: PieChart,        path: '/portfolio/exposure' },
  { id: 'portfolio-attribution',label: 'Performance Attribution',   icon: TrendingUp,      path: '/portfolio/attribution' },
  { id: 'portfolio-risk',       label: 'Risk & Regime Fit',         icon: ShieldAlert,     path: '/portfolio/risk' },
  { id: 'portfolio-scenario',   label: 'Scenario & Stress View',    icon: Zap,             path: '/portfolio/scenario' },
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
const SidebarInner: React.FC<{ signOut: () => void; user: any; profile: any }> = ({ signOut, user, profile }) => {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();

  const {
    workspaces,
    currentWorkspace,
    projects,
    currentProject,
    selectWorkspace,
    selectProject,
    deleteWorkspace,
    updateWorkspace,
  } = useWorkspace();

  const [wsOpen, setWsOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [showCreateProj, setShowCreateProj] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

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

  const isPortfolioRoute = location.pathname.startsWith('/portfolio/');
  const [piOpen, setPiOpen] = useState(() => {
    const stored = localStorage.getItem('portfolio-intelligence-expanded');
    return stored === null ? false : stored === 'true';
  });

  useEffect(() => {
    if (isPortfolioRoute && !piOpen) {
      setPiOpen(true);
      localStorage.setItem('portfolio-intelligence-expanded', 'true');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPortfolioRoute]);

  const togglePi = () => {
    const next = !piOpen;
    setPiOpen(next);
    localStorage.setItem('portfolio-intelligence-expanded', String(next));
  };

  const currentTab = menuItems.find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  )?.id || (location.pathname.startsWith('/settings') ? 'settings' : 'dashboard');

  const initials = (profile?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase();

  // Shared renderer for a flat (non-collapsible) main-nav item.
  const renderNavItem = (item: typeof menuItems[number]) => {
    const active = currentTab === item.id;
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          render={(props) => <Link {...props} to={item.path} />}
          isActive={active}
          tooltip={collapsed ? item.label : undefined}
          className="ds-transition-fast"
          style={{
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
          }}
          onMouseEnter={(e) => {
            if (!active) {
              (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-accent)';
              (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-accent-foreground)';
            }
          }}
          onMouseLeave={(e) => {
            if (!active) {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-foreground)';
            }
          }}
        >
          <item.icon
            size={15}
            style={{ color: active ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)', opacity: active ? 1 : 0.6, flexShrink: 0 }}
          />
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
              title={currentWorkspace?.name || 'Workspace'} 
              onClick={() => {}}
            >
              {(currentWorkspace?.name?.charAt(0) || 'W').toUpperCase()}
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

            {/* Workspace Select Menu */}
            <div className="relative">
              <p style={{ fontSize: '0.55rem', fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.18rem' }}>Workspace</p>
              <button
                onClick={() => { setWsOpen(!wsOpen); setProjOpen(false); }}
                className="w-full text-left flex items-center justify-between p-1.5 rounded-md border border-divider hover:bg-light transition-colors cursor-pointer select-none"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', minHeight: '1.875rem' }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 size={12} style={{ color: 'var(--primary)' }} />
                  <span className="truncate text-xs font-semibold text-secondary-foreground">
                    {currentWorkspace?.name || 'Provisioning...'}
                  </span>
                </div>
                <ChevronDown size={12} className="text-muted-foreground shrink-0 ml-1" />
              </button>

              {/* Workspace Dropdown Panel */}
              {wsOpen && (
                <div 
                  className="absolute left-0 right-0 mt-1 rounded-md border border-divider shadow-md p-1 z-50 flex flex-col gap-0.5 ds-fade-in"
                  style={{ background: 'var(--popover)', borderColor: 'var(--border)' }}
                >
                  <p className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Select Workspace</p>
                  
                  <div style={{ maxHeight: '7.5rem', overflowY: 'auto' }}>
                    {workspaces.map(ws => {
                      const isActive = ws.id === currentWorkspace?.id;
                      return (
                        <div
                          key={ws.id}
                          className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-light transition-colors text-secondary-foreground cursor-pointer relative group"
                          style={{ background: isActive ? 'var(--accent)' : 'transparent', fontWeight: isActive ? 600 : 400 }}
                          onClick={async () => {
                            setWsOpen(false);
                            await selectWorkspace(ws.id);
                          }}
                        >
                          <span className="truncate flex-1">{ws.name}</span>
                          
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(menuOpenId === ws.id ? null : ws.id);
                              }}
                              className={`p-1 rounded-md transition-all ${menuOpenId === ws.id ? 'opacity-100 text-primary bg-muted/50' : 'opacity-40 group-hover:opacity-100 hover:bg-muted text-muted-foreground'}`}
                            >
                              <MoreVertical size={14} />
                            </button>
                            {isActive && <Check size={11} style={{ color: 'var(--primary)' }} />}
                          </div>

                          {menuOpenId === ws.id && (
                            <div 
                              className="absolute right-1 top-full mt-0.5 w-24 bg-popover border border-border shadow-lg rounded-md z-[60] py-1 ds-fade-in"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                onClick={async () => {
                                  const newName = window.prompt("RENAME WORKSPACE:", ws.name);
                                  if (newName && newName !== ws.name) {
                                    await updateWorkspace(ws.id, { name: newName });
                                  }
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-2 py-1.5 text-[10px] hover:bg-muted flex items-center gap-2 transition-colors"
                              >
                                <Edit2 size={10} className="text-primary" /> Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (window.confirm(`PERMANENTLY DELETE WORKSPACE "${ws.name.toUpperCase()}"?\nThis action cannot be undone.`)) {
                                    await deleteWorkspace(ws.id);
                                  }
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-2 py-1.5 text-[10px] hover:bg-red-500/10 text-red-500 flex items-center gap-2 transition-colors"
                              >
                                <Trash2 size={10} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-divider my-1" />
                  
                  {/* Actions */}
                  <button
                    onClick={() => { setWsOpen(false); setShowSettings(true); }}
                    className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-light transition-colors text-muted-foreground cursor-pointer"
                  >
                    <Settings2 size={11} />
                    <span>Workspace Settings</span>
                  </button>
                  <button
                    onClick={() => { setWsOpen(false); setShowCreateWs(true); }}
                    className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-light transition-colors text-muted-foreground cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>Create Workspace</span>
                  </button>
                </div>
              )}
            </div>

            {/* Project Select Menu */}
            <div className="relative">
              <p style={{ fontSize: '0.55rem', fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.18rem' }}>Research Focus</p>
              <button
                onClick={() => { setProjOpen(!projOpen); setWsOpen(false); }}
                className="w-full text-left flex items-center justify-between p-1.5 rounded-md border border-divider hover:bg-light transition-colors cursor-pointer select-none"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', minHeight: '1.875rem' }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin size={12} style={{ color: 'var(--chart-2)' }} />
                  <span className="truncate text-xs font-medium text-secondary-foreground">
                    {currentProject?.name || 'Institutional Portfolio'}
                  </span>
                </div>
                <ChevronDown size={12} className="text-muted-foreground shrink-0 ml-1" />
              </button>

              {/* Project Dropdown Panel */}
              {projOpen && (
                <div 
                  className="absolute left-0 right-0 mt-1 rounded-md border border-divider shadow-md p-1 z-50 flex flex-col gap-0.5 ds-fade-in"
                  style={{ background: 'var(--popover)', borderColor: 'var(--border)' }}
                >
                  <p className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Select Research Asset</p>
                  
                  {/* Option for All Sites */}
                  <button
                    onClick={() => {
                      setProjOpen(false);
                      selectProject(null);
                    }}
                    className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-light transition-colors text-secondary-foreground cursor-pointer"
                    style={{ background: !currentProject ? 'var(--accent)' : 'transparent', fontWeight: !currentProject ? 600 : 400 }}
                  >
                    <span>Institutional Portfolio</span>
                    {!currentProject && <Check size={11} style={{ color: 'var(--chart-2)' }} />}
                  </button>

                  <div style={{ maxHeight: '7.5rem', overflowY: 'auto' }}>
                    {projects.map(p => {
                      const isActive = p.id === currentProject?.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setProjOpen(false);
                            selectProject(p.id);
                          }}
                          className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-light transition-colors text-secondary-foreground cursor-pointer"
                          style={{ background: isActive ? 'var(--accent)' : 'transparent', fontWeight: isActive ? 600 : 400 }}
                        >
                          <span className="truncate">{p.name}</span>
                          {isActive && <Check size={11} style={{ color: 'var(--chart-2)' }} />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-divider my-1" />
                  
                  <button
                    onClick={() => { setProjOpen(false); setShowCreateProj(true); }}
                    className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-light transition-colors text-muted-foreground cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>Create Portfolio / Strategy</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modals Injected inline */}
            <CreateWorkspaceModal isOpen={showCreateWs} onClose={() => setShowCreateWs(false)} />
            <CreateProjectModal isOpen={showCreateProj} onClose={() => setShowCreateProj(false)} />
            <WorkspaceSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
          </div>
        )}
      </SidebarHeader>

      {/* Main nav */}
      <SidebarContent className="px-2 py-3 flex-1">
        {/* ── Discover ─────────────────────────────────────── */}
        <NavSectionLabel collapsed={collapsed} first>Discover</NavSectionLabel>
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
              onClick={toggleMd}
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
                onClick={toggleMd}
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
              {mdOpen && (
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

        {/* ── Portfolio Intelligence expandable group ────────────── */}
        <div style={{ marginTop: 4 }}>
          <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '4px 4px 6px' }} />

          {collapsed ? (
            <div
              title="Portfolio Intelligence"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.4375rem',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                background: isPortfolioRoute ? 'var(--sidebar-accent)' : 'transparent',
                border: isPortfolioRoute ? '1px solid var(--sidebar-border)' : '1px solid transparent',
              }}
              onClick={togglePi}
            >
              <Briefcase
                size={15}
                style={{
                  color: isPortfolioRoute ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)',
                  opacity: isPortfolioRoute ? 1 : 0.6,
                }}
              />
            </div>
          ) : (
            <>
              <button
                onClick={togglePi}
                aria-expanded={piOpen}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.4rem 0.625rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: isPortfolioRoute ? 'var(--sidebar-accent)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isPortfolioRoute) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-accent)';
                }}
                onMouseLeave={(e) => {
                  if (!isPortfolioRoute) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <Briefcase
                  size={15}
                  style={{
                    color: isPortfolioRoute ? 'var(--sidebar-primary)' : 'var(--sidebar-foreground)',
                    opacity: isPortfolioRoute ? 1 : 0.6,
                    flexShrink: 0,
                  }}
                />
                <span style={{
                  flex: 1,
                  fontSize: '0.8125rem',
                  fontWeight: isPortfolioRoute ? 500 : 400,
                  color: isPortfolioRoute ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-foreground)',
                  opacity: isPortfolioRoute ? 1 : 0.8,
                  letterSpacing: '-0.01em',
                }}>
                  Portfolio Intelligence
                </span>
                {isPortfolioRoute && !piOpen && (
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--sidebar-primary)',
                    flexShrink: 0,
                  }} />
                )}
                <span style={{
                  display: 'flex',
                  transition: 'transform 200ms ease',
                  transform: piOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  color: 'var(--muted-foreground)',
                  flexShrink: 0,
                }}>
                  <ChevronRight size={13} />
                </span>
              </button>

              {piOpen && (
                <div style={{ marginTop: 2, paddingLeft: 8 }}>
                  {PORTFOLIO_INTELLIGENCE_ITEMS.map((item) => {
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

        {/* ── Library ──────────────────────────────────────── */}
        <NavSectionLabel collapsed={collapsed}>Library</NavSectionLabel>
        <SidebarMenu className="gap-0.5">
          {LIBRARY_ITEMS.map(renderNavItem)}
        </SidebarMenu>

        {/* ── Data ─────────────────────────────────────────── */}
        <NavSectionLabel collapsed={collapsed}>Data</NavSectionLabel>
        <SidebarMenu className="gap-0.5">
          {DATA_ITEMS.map(renderNavItem)}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer: User Profile & Settings Navigation */}
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
            title={collapsed ? "Settings & Account" : undefined}
          >
            {/* User Avatar */}
            {profile?.photoURL && profile.photoURL.startsWith('gradient:') ? (
              <div style={{
                width: '1.875rem',
                height: '1.875rem',
                borderRadius: '50%',
                background: profile.photoURL.replace('gradient:', ''),
                border: '1px solid var(--sidebar-border)',
                flexShrink: 0,
              }} />
            ) : (
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
                {profile?.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile?.displayName || 'User'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      // Fallback to initials if image fails to load
                      (e.currentTarget as HTMLElement).style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.innerText = initials;
                      }
                    }}
                  />
                ) : initials}
              </div>
            )}

            {/* User details */}
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
                  {profile?.displayName || user?.email?.split('@')[0] || 'User'}
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
                  {user?.email}
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
  const { user, profile, signOut } = useAuth();
  const { currentWorkspace, currentProject } = useWorkspace();
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

  const currentPage = [...menuItems, ...bottomItems, ...MARKET_DASHBOARD_ITEMS, ...PORTFOLIO_INTELLIGENCE_ITEMS].find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  return (
    <SidebarProvider defaultOpen={true}>
      <div style={{ display: 'flex', height: '100vh', width: '100%', background: 'var(--background)', color: 'var(--foreground)', overflow: 'hidden' }}>
        <SidebarInner signOut={signOut} user={user} profile={profile} />

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
                {/* Workspace indicator chip */}
                <div style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.375rem',
                  padding: '0.1875rem 0.5rem',
                  borderRadius: '0.25rem',
                  background: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--foreground)'
                }}>
                  <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>WS</span>
                  <span className="truncate" style={{ maxWidth: '7.5rem' }}>{currentWorkspace?.name || 'Deplyze'}</span>
                </div>

                <span style={{ color: 'var(--muted-foreground)', opacity: 0.6, fontFamily: 'monospace', fontSize: '0.75rem', userSelect: 'none' }}>/</span>

                {/* Project/Site indicator chip */}
                <div style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.375rem',
                  padding: '0.1875rem 0.5rem',
                  borderRadius: '0.25rem',
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'var(--foreground)'
                }}>
                  <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--chart-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ASSET</span>
                  <span className="truncate" style={{ maxWidth: '7.5rem' }}>{currentProject?.name || 'Institutional Portfolio'}</span>
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

              {/* Live status pill */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.625rem',
                borderRadius: '999px',
                background: 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--chart-2) 25%, transparent)',
              }}>
                <span className="ds-dot ds-dot-live" />
                <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--chart-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  System Active
                </span>
              </div>
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
