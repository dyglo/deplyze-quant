import React, { useState } from 'react';
import { 
  X, 
  Users, 
  CreditCard, 
  Building2, 
  MapPin, 
  Plus, 
  Trash2, 
  Mail, 
  Shield, 
  ExternalLink,
  Briefcase,
  Layers,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import { useWorkspace } from './WorkspaceContext';
import { useAuth } from './AuthProvider';
import { toast } from 'sonner';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ──────────────────────────────────────────────────────────────────
   1. CREATE WORKSPACE MODAL
   ────────────────────────────────────────────────────────────────── */
export const CreateWorkspaceModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  const { createNewWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState('Discretionary Macro');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Workspace name is required');
    setSubmitting(true);
    try {
      await createNewWorkspace(name, slug, type);
      onClose();
      setName('');
      setSlug('');
    } catch (err) {
      // toast is already handled in context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ds-modal-backdrop" onClick={onClose}>
      <div className="ds-modal-container ds-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '28rem' }}>
        <div className="ds-modal-header">
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: 'var(--primary)' }} />
            <h2 className="ds-modal-title">New Workspace</h2>
          </div>
          <button className="ds-modal-close" onClick={onClose}><X size={15} /></button>
        </div>

        <form onSubmit={handleSubmit} className="ds-modal-body">
          <p className="ds-caption mb-4" style={{ lineHeight: 1.4 }}>
            Create a new research desk. Workspaces isolate team members, billing, and projects (strategies / portfolios) from one another.
          </p>

          <div className="ds-form-group">
            <label className="ds-form-label">ORGANIZATION NAME</label>
            <input 
              type="text" 
              className="ds-input" 
              placeholder="e.g. Apex Contractors Ltd"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label">WORKSPACE SLUG</label>
            <div className="relative flex items-center">
              <span className="ds-caption absolute left-3 select-none text-muted-foreground" style={{ fontSize: '0.75rem', pointerEvents: 'none' }}>
                deplyze.com/
              </span>
              <input 
                type="text" 
                className="ds-input" 
                style={{ paddingLeft: '5.8rem', fontSize: '0.75rem' }}
                placeholder="apex-contractors"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                required
              />
            </div>
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label">OPERATION TYPE</label>
            <select 
              className="ds-input" 
              value={type}
              onChange={e => setType(e.target.value)}
            >
              <option value="Discretionary Macro">Discretionary Macro</option>
              <option value="Systematic Macro">Systematic Macro</option>
              <option value="Equity Long/Short">Equity Long/Short</option>
              <option value="FX & Commodities">FX & Commodities</option>
              <option value="Crypto Research">Crypto Research</option>
              <option value="Research Education">Research / Education</option>
            </select>
          </div>

          <button 
            type="submit" 
            className="ds-btn ds-btn-primary w-full mt-2"
            disabled={submitting}
          >
            {submitting ? 'PROVISIONING WORKSPACE...' : 'PROVISION WORKSPACE'}
          </button>
        </form>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────
   2. CREATE PROJECT/SITE MODAL
   ────────────────────────────────────────────────────────────────── */
export const CreateProjectModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  const { createNewProject } = useWorkspace();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('Systematic Alpha Strategy');
  const [desc, setDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Project name is required');
    setSubmitting(true);
    try {
      await createNewProject(name, location, type, desc);
      onClose();
      setName('');
      setLocation('');
      setDesc('');
    } catch (err) {
      // handled
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ds-modal-backdrop" onClick={onClose}>
      <div className="ds-modal-container ds-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '28rem' }}>
        <div className="ds-modal-header">
          <div className="flex items-center gap-2">
            <MapPin size={16} style={{ color: 'var(--primary)' }} />
            <h2 className="ds-modal-title">Initialize Research Asset</h2>
          </div>
          <button className="ds-modal-close" onClick={onClose}><X size={15} /></button>
        </div>

        <form onSubmit={handleSubmit} className="ds-modal-body">
          <p className="ds-caption mb-4" style={{ lineHeight: 1.4 }}>
            Register a quantitative research environment or institutional project. Strategies, alpha signals, and portfolio intelligence live here.
          </p>

          <div className="ds-form-group">
            <label className="ds-form-label">INSTITUTIONAL PROJECT NAME</label>
            <input 
              type="text" 
              className="ds-input" 
              placeholder="e.g. Q2 Systematic Alpha Fund"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label">PRIMARY MARKET / JURISDICTION</label>
            <input 
              type="text" 
              className="ds-input" 
              placeholder="e.g. Global Equities or London, UK"
              value={location}
              onChange={e => setLocation(e.target.value)}
              required
            />
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label">ASSET CLASSIFICATION</label>
            <select 
              className="ds-input" 
              value={type}
              onChange={e => setType(e.target.value)}
            >
              <option value="Systematic Alpha Strategy">Systematic Alpha Strategy</option>
              <option value="Risk Management Framework">Risk Management Framework</option>
              <option value="Execution & Order Flow">Execution & Order Flow</option>
              <option value="Macro Portfolio Allocation">Macro Portfolio Allocation</option>
              <option value="Data Ingestion & ETL">Data Ingestion & ETL</option>
            </select>
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label">RESEARCH SCOPE & OBJECTIVES (OPTIONAL)</label>
            <textarea 
              className="ds-input" 
              placeholder="Define the scope of research, backtesting parameters, or strategy objectives..."
              style={{ minHeight: '4.5rem', resize: 'vertical' }}
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="ds-btn ds-btn-primary w-full mt-2"
            disabled={submitting}
          >
            {submitting ? 'INITIALIZING ASSET...' : 'INITIALIZE RESEARCH ASSET'}
          </button>
        </form>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────
   3. WORKSPACE SETTINGS MODAL (INCLUDES BILLING & MEMBERS CONTROLS)
   ────────────────────────────────────────────────────────────────── */
export const WorkspaceSettingsModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  const { 
    currentWorkspace, 
    members, 
    invites, 
    inviteNewMember, 
    removeWorkspaceMember, 
    revokeInvite,
    projects,
    deleteWorkspace
  } = useWorkspace();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'members' | 'assets' | 'billing' | 'danger'>('members');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'viewer'>('viewer');
  const [inviting, setInviting] = useState(false);

  if (!isOpen || !currentWorkspace) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteNewMember(inviteEmail, inviteRole);
      setInviteEmail('');
    } catch (err) {
      // err
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="ds-modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="ds-modal-container ds-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '44rem', width: '95%' }}>
        <div className="ds-modal-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}>
              <Building2 size={16} />
            </div>
            <div>
              <h2 className="ds-modal-title" style={{ fontSize: '0.9375rem' }}>{currentWorkspace.name}</h2>
              <p className="ds-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.625rem', marginTop: '0.125rem' }}>
                Workspace Settings &middot; {currentWorkspace.slug}
              </p>
            </div>
          </div>
          <button className="ds-modal-close" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '0 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)'
        }}>
          {(['members', 'assets', 'billing', 'danger'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.75rem 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: activeTab === tab ? (tab === 'danger' ? '#FF6B6B' : 'var(--primary)') : 'var(--muted-foreground)',
                borderBottom: activeTab === tab ? `2px solid ${tab === 'danger' ? '#FF6B6B' : 'var(--primary)'}` : '2px solid transparent',
                background: 'transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              {tab === 'members' && <span className="flex items-center gap-1.5"><Users size={12} /> Team Members</span>}
              {tab === 'assets' && <span className="flex items-center gap-1.5"><Layers size={12} /> Research Assets ({projects.length})</span>}
              {tab === 'billing' && <span className="flex items-center gap-1.5"><CreditCard size={12} /> Billing & Plan</span>}
              {tab === 'danger' && <span className="flex items-center gap-1.5"><AlertTriangle size={12} style={{ color: activeTab === 'danger' ? '#FF6B6B' : 'inherit' }} /> Danger Zone</span>}
            </button>
          ))}
        </div>

        <div className="p-6" style={{ minHeight: '22rem', maxHeight: '30rem', overflowY: 'auto', background: 'var(--card)' }}>
          
          {/* TAB 1: MEMBERS */}
          {activeTab === 'members' && (
            <div className="flex flex-col gap-5">
              {/* Invite Member form */}
              <div className="ds-panel p-4" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <form onSubmit={handleInvite} className="flex flex-col gap-3">
                  <p className="ds-caption" style={{ fontWeight: 600 }}>INVITE COOPERATIVE OPERATOR</p>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input 
                        type="email" 
                        placeholder="operator@company.com" 
                        className="ds-input w-full"
                        style={{ paddingLeft: '2.25rem' }}
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        required
                      />
                    </div>
                    <select 
                      className="ds-input font-mono" 
                      style={{ width: '7rem', fontSize: '0.75rem' }}
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as any)}
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button type="submit" className="ds-btn ds-btn-primary shrink-0 flex items-center gap-1" disabled={inviting}>
                      <Plus size={13} />
                      {inviting ? 'SENDING...' : 'INVITE'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Members List */}
              <div className="flex flex-col gap-2">
                <p className="ds-caption" style={{ fontWeight: 600 }}>WORKSPACE DIRECTORY ({members.length})</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {members.map(member => {
                    const isOwner = member.uid === currentWorkspace.ownerId;
                    const isCurrentUser = member.uid === user?.uid;
                    return (
                      <div 
                        key={member.uid}
                        className="ds-panel flex items-center justify-between p-3 ds-transition-fast"
                        style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center font-mono text-xs font-semibold text-secondary-foreground">
                            {(member.displayName?.charAt(0) || member.email?.charAt(0) || 'U').toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)' }}>
                              {member.displayName || 'Pending Registration'}
                              {isCurrentUser && <span className="text-muted-foreground ml-1.5 text-xs font-normal">(You)</span>}
                            </p>
                            <p className="font-mono text-muted-foreground" style={{ fontSize: '0.625rem' }}>{member.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono" style={{
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            background: isOwner ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--muted)',
                            border: `1px solid ${isOwner ? 'color-mix(in srgb, var(--primary) 25%, transparent)' : 'var(--border)'}`,
                            color: isOwner ? 'var(--primary)' : 'var(--muted-foreground)',
                            textTransform: 'uppercase'
                          }}>
                            {isOwner ? 'Owner' : member.role || 'Member'}
                          </span>

                          {!isOwner && !isCurrentUser && (
                            <button
                              onClick={() => removeWorkspaceMember(member.uid)}
                              className="text-muted-foreground hover:text-red-500 bg-transparent border-none cursor-pointer p-1 rounded hover:bg-red-50/10 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 size={13} style={{ color: 'var(--muted-foreground)' }} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Invites list */}
              {invites.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="ds-caption" style={{ fontWeight: 600 }}>PENDING OUTSTANDING INVITATIONS ({invites.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {invites.map(invite => (
                      <div 
                        key={invite.id}
                        className="ds-panel flex items-center justify-between p-3"
                        style={{ background: 'var(--card)', border: '1px dashed var(--border)' }}
                      >
                        <div className="flex items-center gap-2">
                          <Mail size={12} className="text-muted-foreground" />
                          <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--foreground)' }}>{invite.email}</p>
                            <p className="font-mono text-muted-foreground" style={{ fontSize: '0.625rem' }}>Awaiting registration</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono" style={{
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            background: 'rgba(120, 140, 93, 0.08)',
                            border: '1px solid rgba(120, 140, 93, 0.16)',
                            color: 'color-mix(in srgb, #788C5D 85%, var(--foreground))',
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            textTransform: 'uppercase'
                          }}>
                            {invite.role}
                          </span>

                          <button
                            onClick={() => revokeInvite(invite.id)}
                            className="bg-transparent border-none cursor-pointer text-muted-foreground hover:text-red-500 p-1"
                            title="Revoke invitation"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RESEARCH ASSETS */}
          {activeTab === 'assets' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <p className="ds-caption" style={{ fontWeight: 600 }}>RESEARCH ASSETS & ENVIRONMENTS</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {projects.map(proj => (
                  <div 
                    key={proj.id}
                    className="ds-panel p-3.5 flex items-start gap-3.5"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                  >
                    <div className="w-8 h-8 rounded bg-secondary border border-border flex items-center justify-center shrink-0" style={{ color: 'var(--primary)' }}>
                      <MapPin size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{proj.name}</p>
                      <p className="font-mono text-muted-foreground mt-0.5" style={{ fontSize: '0.625rem' }}>{proj.address}</p>
                      {proj.description && (
                        <p className="text-muted-foreground mt-2" style={{ fontSize: '0.75rem', lineHeight: 1.3 }}>{proj.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 font-mono">
                      <span style={{
                        fontSize: '0.625rem',
                        fontWeight: 600,
                        padding: '0.125rem 0.375rem',
                        borderRadius: '3px',
                        background: 'rgba(120, 140, 93, 0.08)',
                        border: '1px solid rgba(120, 140, 93, 0.16)',
                        color: 'color-mix(in srgb, #788C5D 85%, var(--foreground))',
                        textTransform: 'uppercase'
                      }}>
                        {proj.status || 'Active'}
                      </span>
                      <span className="text-muted-foreground" style={{ fontSize: '0.58rem' }}>ID: {proj.id.slice(0,6)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BILLING */}
          {activeTab === 'billing' && (
            <div className="flex flex-col gap-5">
              {/* Plan overview card */}
              <div className="ds-panel p-5 text-white relative overflow-hidden flex flex-col gap-3.5" style={{ background: 'linear-gradient(135deg, #2D2C2A 0%, #1F1E1D 100%)', border: 'none' }}>
                <div style={{ position: 'absolute', right: '-1rem', bottom: '-1rem', color: '#FFFFFF05', pointerEvents: 'none' }}>
                  <CreditCard size={180} />
                </div>
                
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-muted-foreground uppercase tracking-widest" style={{ fontSize: '0.58rem', opacity: 0.7, color: '#A5A29A' }}>Active Operational Tier</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F4F3EE', marginTop: '0.125rem', letterSpacing: '-0.02em' }}>Enterprise Scale</h3>
                  </div>
                  <span className="font-mono" style={{
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    padding: '0.125rem 0.5rem',
                    borderRadius: '999px',
                    background: 'color-mix(in srgb, var(--primary) 20%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)',
                    color: 'var(--primary)'
                  }}>
                    Active
                  </span>
                </div>

                <div className="flex gap-8 mt-4 font-mono text-xs">
                  <div>
                    <p style={{ color: '#A5A29A' }}>Monthly Charge</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#F4F3EE', marginTop: '0.125rem' }}>$499.00 / mo</p>
                  </div>
                  <div>
                    <p style={{ color: '#A5A29A' }}>Next Invoice Date</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#F4F3EE', marginTop: '0.125rem' }}>June 1, 2026</p>
                  </div>
                  <div>
                    <p style={{ color: '#A5A29A' }}>Billing Status</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#788C5D', marginTop: '0.125rem' }}>Auto-renew active</p>
                  </div>
                </div>
              </div>

              {/* Usage quotas */}
              <div className="flex flex-col gap-3.5 mt-2">
                <p className="ds-caption" style={{ fontWeight: 600 }}>MONTHLY RESOURCE CONSUMPTION</p>
                
                <div className="ds-panel p-4 flex flex-col gap-3.5" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  {/* Compute capacity */}
                  <div>
                    <div className="flex justify-between items-center text-xs font-mono mb-1">
                      <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Parsed Compute Frames</span>
                      <span className="text-muted-foreground">748,192 / 1,000,000 frames (74.8%)</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: '74.8%', background: 'var(--primary)', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* Assets capacity */}
                  <div>
                    <div className="flex justify-between items-center text-xs font-mono mb-1">
                      <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Institutional Research Assets</span>
                      <span className="text-muted-foreground">{projects.length} / 10 assets ({((projects.length/10)*100).toFixed(0)}%)</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(projects.length / 10) * 100}%`, background: 'var(--text-success, #788C5D)', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* Team Members capacity */}
                  <div>
                    <div className="flex justify-between items-center text-xs font-mono mb-1">
                      <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Operational Licenses</span>
                      <span className="text-muted-foreground">{members.length} / 25 users</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(members.length / 25) * 100}%`, background: '#6A9BCC', borderRadius: '2px' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment details */}
              <div className="ds-panel p-4 flex items-center justify-between" style={{ background: 'var(--card)', border: '1px dashed var(--border)' }}>
                <div className="flex items-center gap-3">
                  <CreditCard size={16} className="text-muted-foreground" />
                  <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>Visa ending in 4242</p>
                    <p className="ds-caption" style={{ fontSize: '0.625rem' }}>Expiry: 12/28 &middot; Primary Card</p>
                  </div>
                </div>
                <button className="ds-btn ds-btn-secondary py-1 px-3 text-xs flex items-center gap-1">
                  Update Payment <ArrowRight size={11} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: DANGER ZONE */}
          {activeTab === 'danger' && (
            <div className="flex flex-col gap-6">
              <div className="ds-panel p-5" style={{ background: 'var(--muted)', border: '1px solid rgba(255, 107, 107, 0.2)' }}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                    <Trash2 size={20} className="text-red-500" />
                  </div>
                  <div className="flex-1">
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>Delete Workspace</h3>
                    <p className="ds-caption mt-1" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                      Permanently remove this workspace and all associated data, including institutional projects, research assets, strategy logs, and intelligence reports. 
                      This action is irreversible.
                    </p>
                    
                    <div className="mt-5 p-3.5 rounded border border-red-500/10 bg-red-500/5">
                      <p className="text-red-500 font-bold" style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        WARNING: CRITICAL DESTRUCTION
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                        All <strong>{projects.length} research assets</strong> and <strong>{members.length} member</strong> permissions will be revoked immediately.
                      </p>
                    </div>

                    <button 
                      onClick={() => {
                        if (confirm(`Are you absolutely sure you want to delete "${currentWorkspace?.name}"? All data will be lost forever.`)) {
                          if (currentWorkspace?.id) {
                            deleteWorkspace(currentWorkspace.id);
                            onClose();
                          }
                        }
                      }}
                      className="ds-btn mt-6" 
                      style={{ 
                        background: '#FF6B6B', 
                        color: 'white', 
                        border: 'none',
                        width: '100%',
                        fontWeight: 600,
                        fontSize: '0.8125rem'
                      }}
                    >
                      Permanently Delete "{currentWorkspace?.name}"
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="ds-caption" style={{ fontWeight: 600 }}>WORKSPACE OWNERSHIP</p>
                <div className="ds-panel p-4 flex items-center justify-between" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>Transfer Ownership</p>
                    <p className="ds-caption" style={{ fontSize: '0.625rem' }}>Move this workspace to another account</p>
                  </div>
                  <button className="ds-btn ds-btn-outline py-1 px-3 text-xs">
                    Transfer
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
