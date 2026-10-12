import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GroupContextProvider } from './context/GroupContext';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { Cards } from './components/Cards';
import { Groups } from './components/Groups';
import { Account } from './components/Account';
import { TabType } from './constants/tabs';

const AppContent = () => {
  const { currentUser, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('cards');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">BizCard Pro</h1>
          <p className="text-slate-600 mb-8">로그인이 필요합니다.</p>
          <a
            href="/login"
            className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            로그인
          </a>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'cards':
        return <Cards />;
      case 'groups':
        return <Groups />;
      case 'account':
        return <Account />;
      default:
        return <Cards />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </main>
    </div>
  );
};

export const App = () => {
  return (
    <AuthProvider>
      <GroupContextProvider>
        <AppContent />
      </GroupContextProvider>
    </AuthProvider>
  );
};

export default App;
