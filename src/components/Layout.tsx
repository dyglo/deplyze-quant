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
  Users,
  Database,
  Beaker,
  FileText,
  Telescope,
  Library,
  ChevronLeft,
  ChevronDown,
  Check,
  Plus,
  Settings2,
  Building2,
  MapPin,
  Sun,
  Moon,
  MoreVertical,
  Edit2,
  Trash2,
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

const menuItems = [
  { id: 'terminal',    label: 'Intelligence Terminal',  icon: Activity,        path: '/' },
  { id: 'instruments', label: 'Instrument Intelligence', icon: LineChart,      path: '/instruments' },
  { id: 'macro',       label: 'Macro Regime Desk',      icon: TrendingUp,      path: '/macro' },
  { id: 'cross-asset', label: 'Cross-Asset Matrix',     icon: Network,         path: '/cross-asset' },
  { id: 'positioning', label: 'Positioning & Sentiment', icon: Users,          path: '/positioning' },
  { id: 'models',      label: 'Model Observatory',      icon: Telescope,       path: '/models' },
  { id: 'lab',         label: 'Quant Lab',              icon: Beaker,          path: '/lab' },
  { id: 'copilot',     label: 'Research Copilot',       icon: MessageSquare,   path: '/copilot' },
  { id: 'warehouse',   label: 'Data Warehouse',         icon: Database,        path: '/warehouse' },
  { id: 'briefings',   label: 'Briefings',              icon: FileText,        path: '/briefings' },
  { id: 'library',    label: 'Research Library',       icon: Library,         path: '/library' },
];

const bottomItems = [
  { id: 'settings',   label: 'Settings & Account', icon: Settings,        path: '/settings' },
];

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

  const currentTab = menuItems.find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  )?.id || (location.pathname.startsWith('/settings') ? 'settings' : 'dashboard');

  const initials = (profile?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r-0 select-none" style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' }}>
      {/* Dynamic Workspace & Project Selectors */}
      <SidebarHeader className="px-3 py-3" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-3.5 py-1">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              title="Deplyze Quant"
            >
              <Activity size={14} />
            </div>
            
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
            {/* Logo Row */}
            <div className="flex items-center gap-2 px-0.5">
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
            </div>

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
        <SidebarMenu className="gap-0.5">
          {menuItems.map((item) => {
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
          })}
        </SidebarMenu>

        {/* Divider */}
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

  const currentPage = [...menuItems, ...bottomItems].find(item =>
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
