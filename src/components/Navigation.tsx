/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BusinessCard, ContactGroup, Project, User } from './types.js';
import { getContactGroupIds, contactHasGroup } from './groupUtils.js';
import { TabType } from './constants/tabs.js';
import { normalizeError } from './types/errors.js';
import { Navigation } from './components/Navigation.js';
import { CardGrid } from './components/CardGrid.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { ScanModal } from './components/ScanModal.js';
import { VoiceQuickAddModal } from './components/VoiceQuickAddModal.js';
import { TaxPackageModal } from './components/TaxPackageModal.js';
import { GroupModal } from './components/GroupModal.js';
import { IOModal } from './components/IOModal.js';
import { NearbyRadarMap } from './components/NearbyRadarMap.js';
import { ShareMyCardModal } from './components/ShareMyCardModal.js';
import { ProjectsView } from './components/ProjectsView.js';
import { AuthView } from './components/AuthView.js';
import { PendingApprovalView } from './components/PendingApprovalView.js';
import { EmailVerificationRequiredView } from './components/EmailVerificationRequiredView.js';
import { WithdrawAccountModal } from './components/WithdrawAccountModal.js';
import { SubscriptionModal } from './components/SubscriptionModal.js';
import { UserDirectoryModal } from './components/UserDirectoryModal.js';
import { AddressBackslashCleanupModal } from './components/AddressBackslashCleanupModal.js';
import { VehicleView } from './components/VehicleView.js';
import { WorkLogsView } from './components/WorkLogsView.js';
import { ElectronicApprovalView } from './components/ElectronicApprovalView.js';
import { AdminDocsView } from './components/AdminDocsView.js';
import { AuditLogView } from './components/AuditLogView.js';
import { GlobalSearchModal } from './components/GlobalSearchModal.js';
import { DashboardView } from './components/DashboardView.js';
import { AIIntelligenceView } from './components/AIIntelligenceView.js';
import { LegalModal } from './components/LegalModal.js';
import { OrgChartView } from './components/OrgChartView.js';
import { AnnouncementsView } from './components/AnnouncementsView.js';
import { TeamChatView } from './components/TeamChatView.js';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return '알 수 없는 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('bizcard_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<TabType>('cards');
  
  const [contacts, setContacts] = useState<BusinessCard[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [contactSortOrder, setContactSortOrder] = useState<'recent' | 'name'>('recent');
  const [projectFilterStatus, setProjectFilterStatus] = useState<'all' | Project['status']>('all');

  const [isScanOpen, setIsScanOpen] = useState<boolean>(false);
  const [isVoiceQuickAddOpen, setIsVoiceQuickAddOpen] = useState<boolean>(false);
  const [isTaxPackageOpen, setIsTaxPackageOpen] = useState<boolean>(false);
  const [triggerNewProject, setTriggerNewProject] = useState<number>(0);
  const [viewResetNonce, setViewResetNonce] = useState<number>(0);
  const [triggerProjectsExcelExport, setTriggerProjectsExcelExport] = useState<number>(0);
  const [triggerProjectsPrintPreview, setTriggerProjectsPrintPreview] = useState<number>(0);
  const [projectsViewMode, setProjectsViewMode] = useState<'cards' | 'listOutput' | 'pipeline' | 'pnl'>('cards');
  const [isShareMyCardOpen, setIsShareMyCardOpen] = useState<boolean>(false);
  const [selectedContactDetail, setSelectedContactDetail] = useState<BusinessCard | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'info' | 'history' | 'edit'>('info');
  const [isUserDirectoryOpen, setIsUserDirectoryOpen] = useState<boolean>(false);
  const [isAddressCleanupOpen, setIsAddressCleanupOpen] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(
    () => new URLSearchParams(window.location.search).has('authKey')
  );
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [focusProjectId, setFocusProjectId] = useState<string | undefined>(undefined);
  const [focusProjectSignal, setFocusProjectSignal] = useState(0);

  const handleOpenContactFromSearch = (contact: BusinessCard) => {
    setActiveTab('cards');
    setDetailModalTab('info');
    setSelectedContactDetail(contact);
  };
  const handleOpenProjectFromSearch = (projectId: string) => {
    setActiveTab('projects');
    setProjectsViewMode('cards');
    setFocusProjectId(projectId);
    setFocusProjectSignal((n) => n + 1);
  };
  const handleOpenVehiclesFromSearch = () => setActiveTab('vehicles');
  const handleOpenWorkLogsFromSearch = () => setActiveTab('worklogs');

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('bizcard_user');
    setCurrentUser(null);
    setContacts([]);
    setGroups([]);
    setProjects([]);
  };

  const refreshCurrentUserStatus = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.user) {
        localStorage.setItem('bizcard_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
      }
    } catch {
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          localStorage.removeItem('bizcard_user');
          setCurrentUser(null);
          return;
        }
        const data = await res.json().catch(() => null);
        if (data?.user) {
          localStorage.setItem('bizcard_user', JSON.stringify(data.user));
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchInitialData();
    }
  }, [currentUser]);

  const fetchInitialData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const headers = { 'x-user-id': currentUser.id };
      const [cRes, gRes, pRes] = await Promise.all([
        fetch('/api/contacts', { headers }).then(r => r.json()),
        fetch('/api/groups', { headers }).then(r => r.json()),
        fetch('/api/projects', { headers }).then(r => r.json())
      ]);
      
      if (Array.isArray(cRes)) setContacts(cRes);
      if (Array.isArray(gRes)) setGroups(gRes);
      if (Array.isArray(pRes)) setProjects(pRes);
    } catch (err) {
      console.warn('API fetch fail, using default samples fallback:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNewCard = async (newCard: BusinessCard) => {
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(newCard)
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
        throw new Error(data?.error || `명함 저장에 실패했습니다 (상태: ${res.status}). 잠시 후 다시 시도해주세요.`);
      }

      const saved = await res.json();
      setContacts(prev => [saved, ...prev]);
    } catch (err: unknown) {
      alert(`명함 저장에 실패했습니다.\n${getErrorMessage(err)}`);
    }
  };

  const handleUpdateCard = async (updated: BusinessCard) => {
    try {
      const res = await fetch(`/api/contacts/${updated.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(updated)
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
        throw new Error(data?.error || `명함 수정 저장에 실패했습니다 (상태: ${res.status}).`);
      }
      const data = await res.json();
      setContacts(prev => prev.map(c => c.id === data.id ? data : c));
      setSelectedContactDetail(data);
    } catch (err: unknown) {
      alert(`명함 수정 저장에 실패했습니다.\n${getErrorMessage(err)}`);
    }
  };

  const handleDeleteCard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 명함 연락처를 완전히 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
        headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
      });
      if (!res.ok) throw new Error(`상태: ${res.status}`);
      setContacts(prev => prev.filter(c => c.id !== id));
      if (selectedContactDetail?.id === id) setSelectedContactDetail(null);
    } catch (err: unknown) {
      alert(`명함 삭제에 실패했습니다.\n${err.message || '네트워크 상태를 확인하고 다시 시도해주세요.'}`);
    }
  };

  const handleAddCallHistory = async (
    contactId: string, 
    record: { type: 'incoming'|'outgoing'|'missed'; duration?: string; note?: string }
  ) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/history`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(record)
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        throw new Error(`상태: ${res.status}`);
      }
      const updated = await res.json();
      setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelectedContactDetail(updated);
    } catch (err) {
      console.error('통화 기록 저장 실패:', err);
    }
  };

  const handleCreateGroup = async (g: { name: string; color: string }) => {
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(g)
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        throw new Error(`그룹 생성에 실패했습니다 (상태: ${res.status}).`);
      }
      const created = await res.json();
      setGroups(prev => [...prev, created]);
    } catch (err: unknown) {
      alert(`그룹 생성에 실패했습니다.\n${err.message || '네트워크 상태를 확인하고 다시 시도해주세요.'}`);
    }
  };

  const handleUpdateGroup = async (id: string, name: string, color: string) => {
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({ name, color })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        throw new Error(`그룹 수정에 실패했습니다 (상태: ${res.status}).`);
      }
      const updated = await res.json();
      setGroups(prev => prev.map(g => g.id === id ? updated : g));
    } catch (err: unknown) {
      alert(`그룹 수정에 실패했습니다.\n${err.message || '네트워크 상태를 확인하고 다시 시도해주세요.'}`);
    }
  };

  const handleToggleGroupPrivate = async (id: string, isPrivate: boolean) => {
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({ isPrivate })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        throw new Error(`그룹 공개 설정 변경에 실패했습니다 (상태: ${res.status}).`);
      }
      const updated = await res.json();
      setGroups(prev => prev.map(g => g.id === id ? updated : g));
    } catch (err: unknown) {
      alert(`그룹 공개 설정 변경에 실패했습니다.\n${err.message || '네트워크 상태를 확인하고 다시 시도해주세요.'}`);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'DELETE',
        headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
      });
      if (!res.ok) throw new Error(`상태: ${res.status}`);
      setGroups(prev => prev.filter(g => g.id !== id));
      setContacts(prev => prev.map(c => {
        const ids = getContactGroupIds(c).filter((gid) => gid !== id);
        return { ...c, groupId: ids[0] || '', groupIds: ids };
      }));
      if (selectedGroupFilter === id) setSelectedGroupFilter('all');
    } catch (err: unknown) {
      alert(`그룹 삭제에 실패했습니다.\n${err.message || '네트워크 상태를 확인하고 다시 시도해주세요.'}`);
    }
  };

  if (!currentUser) {
    return <AuthView onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  if (currentUser.emailVerified === false) {
    return (
      <EmailVerificationRequiredView
        currentUser={currentUser}
        onLogout={handleLogout}
        onVerified={refreshCurrentUserStatus}
        onRefreshStatus={refreshCurrentUserStatus}
      />
    );
  }

  if (currentUser.type === 'company' && currentUser.approvalStatus === 'pending') {
    return <PendingApprovalView currentUser={currentUser} onLogout={handleLogout} onRefreshStatus={refreshCurrentUserStatus} />;
  }

  const filteredContacts = contacts.filter(c => {
    const matchGroup = selectedGroupFilter === 'all' || contactHasGroup(c, selectedGroupFilter);
    const q = searchQuery.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    const matchQuery = !q || (
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q) ||
      c.phoneMobile.includes(q) ||
      (qDigits.length > 0 && c.phoneMobile.replace(/\D/g, '').includes(qDigits)) ||
      (qDigits.length > 0 && (c.phoneOffice || '').replace(/\D/g, '').includes(qDigits)) ||
      (c.address || '').toLowerCase().includes(q) ||
      (c.address2 || '').toLowerCase().includes(q) ||
      (c.memo || '').toLowerCase().includes(q)
    );
    return matchGroup && matchQuery;
  }).sort((a, b) => {
    if (contactSortOrder === 'name') {
      return a.name.localeCompare(b.name, 'ko');
    }
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedGroup={selectedGroupFilter}
        setSelectedGroup={setSelectedGroupFilter}
        groups={groups}
        onOpenScanModal={() => setIsScanOpen(true)}
        onOpenVoiceQuickAdd={() => setIsVoiceQuickAddOpen(true)}
        onOpenTaxPackage={() => setIsTaxPackageOpen(true)}
        onOpenShareMyCardModal={() => setIsShareMyCardOpen(true)}
        onOpenUserDirectory={() => setIsUserDirectoryOpen(true)}
        onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
        onOpenNewProject={() => setTriggerNewProject((n) => n + 1)}
        onExportProjectsExcel={() => setTriggerProjectsExcelExport((n) => n + 1)}
        onOpenProjectsPrintPreview={() => setTriggerProjectsPrintPreview((n) => n + 1)}
        projectsViewMode={projectsViewMode}
        onShowProjectsCardView={() => setProjectsViewMode('cards')}
        onShowProjectsListOutput={() => setProjectsViewMode('listOutput')}
        onShowProjectsPipeline={() => setProjectsViewMode('pipeline')}
        onShowProjectsPnl={() => setProjectsViewMode('pnl')}
        totalContactsCount={contacts.length}
        projectFilterStatus={projectFilterStatus}
        setProjectFilterStatus={setProjectFilterStatus}
        projects={projects}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenWithdrawModal={() => setIsWithdrawModalOpen(true)}
        onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
        onRequestViewReset={() => {
          setViewResetNonce((n) => n + 1);
          setSearchQuery('');
          setProjectFilterStatus('all');
          setProjectsViewMode('cards');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        
        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-400">AI 명함 DB 및 주변 위치 인덱스를 로딩 중입니다...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && currentUser && (
              <DashboardView
                key={viewResetNonce}
                currentUser={currentUser}
                contacts={contacts}
                projects={projects}
                onOpenContact={handleOpenContactFromSearch}
                onOpenProject={handleOpenProjectFromSearch}
                onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
                onOpenUserDirectory={() => setIsUserDirectoryOpen(true)}
                onOpenApprovals={() => setActiveTab('approvals')}
              />
            )}

            {activeTab === 'cards' && (
              <CardGrid
                key={viewResetNonce}
                contacts={filteredContacts}
                groups={groups}
                projects={projects}
                currentUser={currentUser}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onUpdateContact={handleUpdateCard}
                onSelectContact={(c) => {
                  setDetailModalTab('info');
                  setSelectedContactDetail(c);
                }}
                onEditContact={(c) => {
                  setDetailModalTab('edit');
                  setSelectedContactDetail(c);
                }}
                onDeleteContact={handleDeleteCard}
                onNavigateToProjects={() => setActiveTab('projects')}
                onOpenProject={handleOpenProjectFromSearch}
                onAddCallHistory={handleAddCallHistory}
                sortOrder={contactSortOrder}
                setSortOrder={setContactSortOrder}
              />
            )}

            {activeTab === 'nearby' && (
              <NearbyRadarMap
                contacts={contacts}
                groups={groups}
                onSelectContact={(c) => {
                  setDetailModalTab('info');
                  setSelectedContactDetail(c);
                }}
                onContactsRefresh={setContacts}
                onAddCallHistory={handleAddCallHistory}
              />
            )}

            {activeTab === 'groups' && (
              <GroupModal
                groups={groups}
                contacts={contacts}
                currentUser={currentUser}
                onCreateGroup={handleCreateGroup}
                onUpdateGroup={handleUpdateGroup}
                onDeleteGroup={handleDeleteGroup}
                onTogglePrivate={handleToggleGroupPrivate}
              />
            )}

            {activeTab === 'io' && (
              <IOModal
                contacts={contacts}
                groups={groups}
                onImportSuccess={(list) => setContacts(list)}
              />
            )}

            {activeTab === 'projects' && (
              <ProjectsView
                key={viewResetNonce}
                contacts={contacts}
                setContacts={setContacts}
                projects={projects}
                setProjects={setProjects}
                filterStatus={projectFilterStatus}
                setFilterStatus={setProjectFilterStatus}
                currentUser={currentUser}
                triggerNewProject={triggerNewProject}
                triggerExcelExport={triggerProjectsExcelExport}
                triggerPrintPreview={triggerProjectsPrintPreview}
                viewMode={projectsViewMode}
                focusProjectId={focusProjectId}
                focusProjectSignal={focusProjectSignal}
                onFocusProject={handleOpenProjectFromSearch}
              />
            )}

            {activeTab === 'vehicles' && (
              <VehicleView
                key={viewResetNonce}
                currentUser={currentUser}
                contacts={contacts}
                setContacts={setContacts}
              />
            )}

            {activeTab === 'worklogs' && (
              <WorkLogsView
                key={viewResetNonce}
                contacts={contacts}
                setContacts={setContacts}
                projects={projects}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'approvals' && (
              <ElectronicApprovalView
                key={viewResetNonce}
                currentUser={currentUser}
                onUpdateCurrentUser={(updatedUser) => {
                  setCurrentUser(updatedUser);
                  localStorage.setItem('bizcard_user', JSON.stringify(updatedUser));
                }}
              />
            )}

            {activeTab === 'management' && currentUser?.role === 'admin' && (
              <AdminDocsView
                key={viewResetNonce}
                section="management"
                currentUser={currentUser}
                projects={projects}
              />
            )}
            {activeTab === 'accounting' && currentUser?.role === 'admin' && (
              <AdminDocsView
                key={viewResetNonce}
                section="accounting"
                projects={projects}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'audit_logs' && currentUser?.role === 'admin' && (
              <AuditLogView key={viewResetNonce} currentUser={currentUser} />
            )}

            {activeTab === 'org_chart' && currentUser && (
              <OrgChartView key={viewResetNonce} currentUser={currentUser} />
            )}
            {activeTab === 'announcements' && currentUser && (
              <AnnouncementsView key={viewResetNonce} currentUser={currentUser} />
            )}
            {activeTab === 'team_chat' && currentUser && (
              <TeamChatView key={viewResetNonce} currentUser={currentUser} />
            )}

            {activeTab === 'ai_intelligence' && (
              <AIIntelligenceView
                key={viewResetNonce}
                contacts={contacts}
                groups={groups}
                projects={projects}
                currentUser={currentUser}
                onSelectContact={(c) => {
                  setDetailModalTab('info');
                  setSelectedContactDetail(c);
                }}
                onNavigateToProjects={() => setActiveTab('projects')}
                onOpenProject={handleOpenProjectFromSearch}
              />
            )}
          </>
        )}

      </main>

      {isScanOpen && (
        <ScanModal
          groups={groups}
          contacts={contacts}
          onClose={() => setIsScanOpen(false)}
          onSave={handleSaveNewCard}
          onUpdate={handleUpdateCard}
        />
      )}

      {isVoiceQuickAddOpen && (
        <VoiceQuickAddModal
          groups={groups}
          contacts={contacts}
          onClose={() => setIsVoiceQuickAddOpen(false)}
          onSave={handleSaveNewCard}
          onUpdate={handleUpdateCard}
        />
      )}

      {isTaxPackageOpen && (
        <TaxPackageModal onClose={() => setIsTaxPackageOpen(false)} />
      )}

      {isShareMyCardOpen && (
        <ShareMyCardModal onClose={() => setIsShareMyCardOpen(false)} />
      )}

      <CardDetailModal
        contact={selectedContactDetail}
        groups={groups}
        initialTab={detailModalTab}
        currentUser={currentUser}
        onClose={() => setSelectedContactDetail(null)}
        onUpdateContact={handleUpdateCard}
        onAddCallHistory={handleAddCallHistory}
        isAdmin={currentUser?.role === 'admin'}
        onOpenAddressCleanup={() => setIsAddressCleanupOpen(true)}
      />

      {isUserDirectoryOpen && currentUser && (
        <UserDirectoryModal
          isOpen={isUserDirectoryOpen}
          onClose={() => setIsUserDirectoryOpen(false)}
          currentUser={currentUser}
        />
      )}

      {isAddressCleanupOpen && currentUser && (
        <AddressBackslashCleanupModal
          currentUser={currentUser}
          onClose={() => setIsAddressCleanupOpen(false)}
          onCleaned={() => fetchInitialData()}
        />
      )}

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 space-y-2">
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setLegalTab('terms')} className="hover:text-slate-600 underline underline-offset-2 transition-colors">이용약관</button>
          <span className="text-slate-300">|</span>
          <button onClick={() => setLegalTab('privacy')} className="hover:text-slate-600 underline underline-offset-2 transition-colors">개인정보처리방침</button>
        </div>
        <p className="text-[11px] text-slate-400">
          상호명: (주)카이저솔루션 · 사업자등록번호: 217-81-35654 · 통신판매업신고: [제0000-지역-0000호]
        </p>
        <p className="text-[11px] text-slate-400">
          주소: 경기도 남양주시 순화궁로 272, 519호(동광비즈타워) · 전화: 02-971-0954
        </p>
        <p>© 2026 BizCard. All rights reserved.</p>
      </footer>

      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
      {isWithdrawModalOpen && currentUser && (
        <WithdrawAccountModal
          currentUser={currentUser}
          onClose={() => setIsWithdrawModalOpen(false)}
          onWithdrawn={() => {
            localStorage.removeItem('bizcard_user');
            setCurrentUser(null);
            setContacts([]);
            setGroups([]);
            setProjects([]);
            setIsWithdrawModalOpen(false);
          }}
        />
      )}
      {isSubscriptionModalOpen && currentUser && (
        <SubscriptionModal onClose={() => setIsSubscriptionModalOpen(false)} />
      )}

      {isGlobalSearchOpen && currentUser && (
        <GlobalSearchModal
          isOpen={isGlobalSearchOpen}
          onClose={() => setIsGlobalSearchOpen(false)}
          currentUser={currentUser}
          contacts={contacts}
          projects={projects}
          onOpenContact={handleOpenContactFromSearch}
          onOpenProject={handleOpenProjectFromSearch}
          onOpenVehicles={handleOpenVehiclesFromSearch}
          onOpenWorkLogs={handleOpenWorkLogsFromSearch}
        />
      )}

    </div>
  );
}
