// // src/App.jsx
// import React, { useState } from 'react';
// import Header from './components/Layout/Header';
// import Navigation from './components/Layout/Navigation';
// import Dashboard from './components/Dashboard/Dashboard';
// import NurseManagement from './components/NurseManagement/NurseManagement';
// import RosterView from './components/Roster/RosterView';
// import Settings from './components/Settings/Settings';
// import { useNurses } from './hooks/useNurses';
// import { useRoster } from './hooks/useRoster';
// import { useRosterConfig } from './hooks/useRosterConfig';
// import Footer from './footer'

// const HospitalRosterSystem = () => {
//   const [activeTab, setActiveTab] = useState('dashboard');
//   const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
//   const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

//   // Custom hooks for state management
//   const {
//     nurses,
//     addNurse,
//     updateNurseStatus,
//     deleteNurse,
//     getActiveNurses,
//     getFilteredNurses
//   } = useNurses();

//   const {
//     roster,
//     generateBalancedRoster,
//     getCurrentMonthRoster,
//     getRosterStats,
//     generateNurseAssignmentChart
//   } = useRoster(nurses, selectedMonth, selectedYear);

//   const { rosterConfig, updateRosterConfig } = useRosterConfig();

//   const sharedProps = {
//     nurses,
//     activeNurses: getActiveNurses(),
//     roster,
//     selectedMonth,
//     selectedYear,
//     setSelectedMonth,
//     setSelectedYear,
//     rosterConfig
//   };

//   return (
//     <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
//       <Header activeNurses={getActiveNurses()} />
      
//       <Navigation 
//         activeTab={activeTab} 
//         setActiveTab={setActiveTab} 
//       />

//       <div>
//         {activeTab === 'dashboard' && (
//           <Dashboard 
//             {...sharedProps}
//             getRosterStats={getRosterStats}
//             generateNurseAssignmentChart={generateNurseAssignmentChart}
//           />
//         )}
        
//         {activeTab === 'nurses' && (
//           <NurseManagement 
//             nurses={nurses}
//             addNurse={addNurse}
//             updateNurseStatus={updateNurseStatus}
//             deleteNurse={deleteNurse}
//             getFilteredNurses={getFilteredNurses}
//           />
//         )}
        
//         {activeTab === 'roster' && (
//           <RosterView 
//             {...sharedProps}
//             generateBalancedRoster={() => generateBalancedRoster(rosterConfig)}
//             getCurrentMonthRoster={getCurrentMonthRoster}
//           />
//         )}
        
//         {activeTab === 'settings' && (
//           <Settings 
//             rosterConfig={rosterConfig}
//             updateRosterConfig={updateRosterConfig}
//           />
//         )}
//       </div>
//       <Footer/>
//     </div>
    
//   );
// };

// export default HospitalRosterSystem;



// src/App.jsx (Updated with Export Support)
import React, { useState, useEffect } from 'react';
import Header from './components/Layout/Header';
import Navigation from './components/Layout/Navigation';
import Dashboard from './components/Dashboard/Dashboard';
import NurseManagement from './components/NurseManagement/NurseManagement';
import RosterView from './components/Roster/RosterView';
import Settings from './components/Settings/Settings';
import Login from './components/Auth/Login';
import MemberManagement from './components/Members/MemberManagement';
import SwapRequests from './components/Roster/SwapRequests';
import AdminDashboard from './components/Admin/AdminDashboard';
import FeedbackButton from './components/Feedback/FeedbackButton';
import { useNurses } from './hooks/useNurses';
import { useRoster } from './hooks/useRoster';
import { useRosterConfig } from './hooks/useRosterConfig';

const HospitalRosterSystem = () => {
  // [추가] 로그인 상태 관리. 새로고침해도 로그인이 풀리지 않도록 localStorage에 저장해둔다.
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('mediflow_user');
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch (e) {
        window.localStorage.removeItem('mediflow_user');
      }
    }
    setAuthChecked(true);
  }, []);

  const handleLoginSuccess = (user) => {
    window.localStorage.setItem('mediflow_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    window.localStorage.removeItem('mediflow_user');
    setCurrentUser(null);
  };

  // [추가] 셀프 관리자 승격 등, 로그인 이후 currentUser의 일부 필드(예: role)가 바뀌었을 때
  // 화면 상태와 localStorage를 함께 갱신하기 위한 헬퍼.
  const handleUserUpdate = (updates) => {
    setCurrentUser(prev => {
      if (!prev) return prev;
      const merged = { ...prev, ...updates };
      window.localStorage.setItem('mediflow_user', JSON.stringify(merged));
      return merged;
    });
  };

  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Custom hooks for state management
  const {
    nurses,
    addNurse,
    updateNurseStatus,
    updateNurse,
    deleteNurse,
    getActiveNurses,
    getFilteredNurses,
    updateNurses
  } = useNurses(currentUser);

  const {
    roster,
    generateBalancedRoster,
    getCurrentMonthRoster,
    getRosterStats,
    generateNurseAssignmentChart,
    clearRoster,
    hasRosterData,
    refetchRoster
  } = useRoster(nurses, selectedMonth, selectedYear, updateNurses, currentUser);

  const { rosterConfig, updateRosterConfig } = useRosterConfig(currentUser);

  const sharedProps = {
    nurses,
    activeNurses: getActiveNurses(),
    roster,
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    rosterConfig,
    getCurrentMonthRoster,
    refetchRoster
  };

  // 로그인 여부를 확인하는 동안 잠깐 빈 화면 (깜빡임 방지)
  if (!authChecked) {
    return null;
  }

  // [추가] 로그인 안 된 상태면 로그인/회원가입 화면만 보여준다.
  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Header activeNurses={getActiveNurses()} currentUser={currentUser} onLogout={handleLogout} />
      
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser}
      />

      <div>
        {activeTab === 'dashboard' && (
          <Dashboard 
            {...sharedProps}
            getRosterStats={getRosterStats}
            generateNurseAssignmentChart={generateNurseAssignmentChart}
          />
        )}
        
        {activeTab === 'nurses' && (
          <NurseManagement 
            nurses={nurses}
            addNurse={addNurse}
            updateNurseStatus={updateNurseStatus}
            updateNurse={updateNurse}
            deleteNurse={deleteNurse}
            getFilteredNurses={getFilteredNurses}
            currentUser={currentUser}
          />
        )}
        
        {activeTab === 'roster' && (
          <RosterView 
            {...sharedProps}
            generateBalancedRoster={() => generateBalancedRoster(rosterConfig)}
            clearRoster={() => clearRoster(selectedMonth, selectedYear)}
          />
        )}

        {activeTab === 'swap-requests' && (
          <SwapRequests
            {...sharedProps}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'members' && (
          <MemberManagement currentUser={currentUser} onUserUpdate={handleUserUpdate} />
        )}

        {activeTab === 'admin' && (
          <AdminDashboard currentUser={currentUser} />
        )}
        
        {activeTab === 'settings' && (
          <Settings 
            rosterConfig={rosterConfig}
            updateRosterConfig={updateRosterConfig}
          />
        )}
      </div>

      <FeedbackButton currentUser={currentUser} />
    </div>
  );
};

export default HospitalRosterSystem;