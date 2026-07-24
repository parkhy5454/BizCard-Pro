/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BusinessCard, ContactGroup, Project, User } from './types.js';
import { Navigation } from './components/Navigation.js';
import { CardGrid } from './components/CardGrid.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { ScanModal } from './components/ScanModal.js';
import { GroupModal } from './components/GroupModal.js';
import { IOModal } from './components/IOModal.js';
import { NearbyRadarMap } from './components/NearbyRadarMap.js';
import { ShareMyCardModal } from './components/ShareMyCardModal.js';
import { ProjectsView } from './components/ProjectsView.js';
import { AuthView } from './components/AuthView.js';
import { UserDirectoryModal } from './components/UserDirectoryModal.js';
import { VehicleView } from './components/VehicleView.js';
import { WorkLogsView } from './components/WorkLogsView.js';
import { ElectronicApprovalView } from './components/ElectronicApprovalView.js';

export default function App() {
  // 회원 세션 상태
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('bizcard_user');
    return saved ? JSON.parse(saved) : null;
  });

  // 메인 내비게이션 탭 상태
  const [activeTab, setActiveTab] = useState<'cards' | 'nearby' | 'groups' | 'io' | 'projects' | 'vehicles' | 'worklogs' | 'approvals'>('cards');
  
  // 데이터 상태
  const [contacts, setContacts] = useState<BusinessCard[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 필터 및 검색
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [projectFilterStatus, setProjectFilterStatus] = useState<'all' | Project['status']>('all');

  // 모달 제어 상태
  const [isScanOpen, setIsScanOpen] = useState<boolean>(false);
  const [triggerNewProject, setTriggerNewProject] = useState<number>(0);
  // [수정] Navigation의 "엑셀 다운로드"/"PDF 인쇄" 버튼 신호를 ProjectsView로 전달하기 위한 트리거
  const [triggerProjectsExcelExport, setTriggerProjectsExcelExport] = useState<number>(0);
  const [triggerProjectsPrintPreview, setTriggerProjectsPrintPreview] = useState<number>(0);
  // [수정] "리스트 출력" 탭 켜짐/꺼짐 상태 (카드 목록 ↔ 표 형태 리스트 전환)
  const [isProjectsListOutputActive, setIsProjectsListOutputActive] = useState<boolean>(false);
  const [isShareMyCardOpen, setIsShareMyCardOpen] = useState<boolean>(false);
  const [selectedContactDetail, setSelectedContactDetail] = useState<BusinessCard | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'info' | 'history' | 'edit'>('info');
  const [isUserDirectoryOpen, setIsUserDirectoryOpen] = useState<boolean>(false);

  // 로그아웃 핸들러
  const handleLogout = () => {
    localStorage.removeItem('bizcard_user');
    setCurrentUser(null);
    setContacts([]);
    setGroups([]);
    setProjects([]);
  };

  // 초기 API 로드 - 사용자 로그인된 상태에서만 작동
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

  // 1. 새 명함 저장
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
      const saved = await res.json();
      setContacts(prev => [saved, ...prev]);
    } catch (err) {
      setContacts(prev => [newCard, ...prev]);
    }
  };

  // 2. 명함 수정
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
      const data = await res.json();
      setContacts(prev => prev.map(c => c.id === data.id ? data : c));
      setSelectedContactDetail(data);
    } catch {
      setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelectedContactDetail(updated);
    }
  };

  // 3. 명함 삭제
  const handleDeleteCard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 명함 연락처를 완전히 삭제하시겠습니까?')) return;

    try {
      await fetch(`/api/contacts/${id}`, { 
        method: 'DELETE',
        headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
      });
    } finally {
      setContacts(prev => prev.filter(c => c.id !== id));
      if (selectedContactDetail?.id === id) setSelectedContactDetail(null);
    }
  };

  // 4. 통화 히스토리 타임라인 추가
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
      const updated = await res.json();
      setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelectedContactDetail(updated);
    } catch {
      const target = contacts.find(c => c.id === contactId);
      if (target) {
        const newRec = { id: `call-${Date.now()}`, contactId, timestamp: new Date().toISOString(), ...record };
        const updated = { ...target, callHistory: [newRec, ...target.callHistory] };
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        setSelectedContactDetail(updated);
      }
    }
  };

  // 5. 그룹 생성
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
      const created = await res.json();
      setGroups(prev => [...prev, created]);
    } catch {
      const newG = { id: `g-${Date.now()}`, ...g };
      setGroups(prev => [...prev, newG]);
    }
  };

  // 6. 그룹 수정
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
      const updated = await res.json();
      setGroups(prev => prev.map(g => g.id === id ? updated : g));
    } catch {
      setGroups(prev => prev.map(g => g.id === id ? { ...g, name, color } : g));
    }
  };

  // 7. 그룹 삭제
  const handleDeleteGroup = async (id: string) => {
    const defaultGid = groups[0]?.id || '';
    try {
      await fetch(`/api/groups/${id}`, { 
        method: 'DELETE',
        headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
      });
    } finally {
      setGroups(prev => prev.filter(g => g.id !== id));
      setContacts(prev => prev.map(c => c.groupId === id ? { ...c, groupId: defaultGid } : c));
      if (selectedGroupFilter === id) setSelectedGroupFilter('all');
    }
  };

  // 비로그인 상태일 때 인증 화면 렌더링
  if (!currentUser) {
    return <AuthView onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  // 검색 및 그룹 칩 필터링 적용된 명함 목록
  const filteredContacts = contacts.filter(c => {
    const matchGroup = selectedGroupFilter === 'all' || c.groupId === selectedGroupFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchQuery = !q || (
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q) ||
      c.phoneMobile.includes(q) ||
      (c.memo || '').toLowerCase().includes(q)
    );
    return matchGroup && matchQuery;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      
      {/* 상단 통합 헤더 & 내비게이션 */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedGroup={selectedGroupFilter}
        setSelectedGroup={setSelectedGroupFilter}
        groups={groups}
        onOpenScanModal={() => setIsScanOpen(true)}
        onOpenShareMyCardModal={() => setIsShareMyCardOpen(true)}
        onOpenUserDirectory={() => setIsUserDirectoryOpen(true)}
        onOpenNewProject={() => setTriggerNewProject((n) => n + 1)}
        onExportProjectsExcel={() => setTriggerProjectsExcelExport((n) => n + 1)}
        onOpenProjectsPrintPreview={() => setTriggerProjectsPrintPreview((n) => n + 1)}
        isProjectsListOutputActive={isProjectsListOutputActive}
        onShowProjectsCardView={() => setIsProjectsListOutputActive(false)}
        onShowProjectsListOutput={() => setIsProjectsListOutputActive(true)}
        totalContactsCount={contacts.length}
        projectFilterStatus={projectFilterStatus}
        setProjectFilterStatus={setProjectFilterStatus}
        projects={projects}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* 바디 메인 영역 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        
        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-400">AI 명함 DB 및 주변 위치 인덱스를 로딩 중입니다...</p>
          </div>
        ) : (
          <>
            {/* 탭 1: 전체 명함 뷰 */}
            {activeTab === 'cards' && (
              <CardGrid
                contacts={filteredContacts}
                groups={groups}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onSelectContact={(c) => {
                  setDetailModalTab('info');
                  setSelectedContactDetail(c);
                }}
                onEditContact={(c) => {
                  setDetailModalTab('edit');
                  setSelectedContactDetail(c);
                }}
                onDeleteContact={handleDeleteCard}
              />
            )}

            {/* 탭 2: 주변 레이더 지도 뷰 */}
            {activeTab === 'nearby' && (
              <NearbyRadarMap
                contacts={contacts}
                groups={groups}
                onSelectContact={(c) => {
                  setDetailModalTab('info');
                  setSelectedContactDetail(c);
                }}
              />
            )}

            {/* 탭 3: 그룹 관리 뷰 */}
            {activeTab === 'groups' && (
              <GroupModal
                groups={groups}
                contacts={contacts}
                onCreateGroup={handleCreateGroup}
                onUpdateGroup={handleUpdateGroup}
                onDeleteGroup={handleDeleteGroup}
              />
            )}

            {/* 탭 4: 가져오기/내보내기 뷰 */}
            {activeTab === 'io' && (
              <IOModal
                contacts={contacts}
                groups={groups}
                onImportSuccess={(list) => setContacts(list)}
              />
            )}

            {/* 탭 5: 프로젝트 및 영업 팔로우업 관리 뷰 */}
            {activeTab === 'projects' && (
              <ProjectsView 
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
                showListOutputView={isProjectsListOutputActive}
              />
            )}

            {/* 탭 6: 통합 차량 관리 뷰 */}
            {activeTab === 'vehicles' && (
              <VehicleView 
                currentUser={currentUser}
                contacts={contacts}
                setContacts={setContacts}
              />
            )}

            {/* 탭 7: 업무일지 (일일/주간) 뷰 */}
            {activeTab === 'worklogs' && (
              <WorkLogsView 
                contacts={contacts}
                setContacts={setContacts}
                projects={projects}
                currentUser={currentUser}
              />
            )}

            {/* 탭 8: 전자결재 (가지급금 정산서 / 휴가 신청서) 뷰 */}
            {activeTab === 'approvals' && (
              <ElectronicApprovalView 
                currentUser={currentUser}
              />
            )}
          </>
        )}

      </main>

      {/* 모달 1: 명함 스캔 등록 */}
      {isScanOpen && (
        <ScanModal
          groups={groups}
          contacts={contacts}
          onClose={() => setIsScanOpen(false)}
          onSave={handleSaveNewCard}
          onUpdate={handleUpdateCard}
        />
      )}

      {/* 모달 2: 내 명함 공유 및 전송 */}
      {isShareMyCardOpen && (
        <ShareMyCardModal onClose={() => setIsShareMyCardOpen(false)} />
      )}

      {/* 모달 3: 명함 상세정보 및 과거 통화 히스토리 뷰 */}
      <CardDetailModal
        contact={selectedContactDetail}
        groups={groups}
        initialTab={detailModalTab}
        currentUser={currentUser}
        onClose={() => setSelectedContactDetail(null)}
        onUpdateContact={handleUpdateCard}
        onAddCallHistory={handleAddCallHistory}
      />

      {/* 모달 4: 가입 회원 및 동료 디렉토리 */}
      {isUserDirectoryOpen && currentUser && (
        <UserDirectoryModal
          isOpen={isUserDirectoryOpen}
          onClose={() => setIsUserDirectoryOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* 하단 저작권 푸터 */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>© 2026 BizCard Pro AI. All rights reserved. Powered by Google Gemini Vision & Express Fullstack.</p>
      </footer>

    </div>
  );
}
