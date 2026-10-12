import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGroupContext } from '../context/GroupContext';
import { TabType, TAB_CONFIGS, canAccessTab, getAccessDenialReason } from '../constants/tabs';

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const { currentUser } = useAuth();
  const { groups } = useGroupContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMainTabClick = (tab: TabType) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <h1 className="text-2xl font-bold text-indigo-600">BizCard Pro</h1>
          </div>

          {/* Main Navigation Tabs */}
          <div className="hidden md:flex items-center gap-2">
            {TAB_CONFIGS.map((tabConfig) => {
              const denied = !canAccessTab(tabConfig.id, currentUser, groups);
              const reason = denied ? getAccessDenialReason(tabConfig.id, currentUser) : null;

              return (
                <button
                  key={tabConfig.id}
                  onClick={() => handleMainTabClick(tabConfig.id)}
                  disabled={denied}
                  title={reason}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                    activeTab === tabConfig.id
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  } ${denied ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <tabConfig.icon className="w-4 h-4" />
                  <span>{tabConfig.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-slate-500 hover:text-slate-700"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-slate-200 py-2">
            {TAB_CONFIGS.map((tabConfig) => {
              const denied = !canAccessTab(tabConfig.id, currentUser, groups);
              const reason = denied ? getAccessDenialReason(tabConfig.id, currentUser) : null;

              return (
                <button
                  key={tabConfig.id}
                  onClick={() => handleMainTabClick(tabConfig.id)}
                  disabled={denied}
                  title={reason}
                  className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-all ${
                    activeTab === tabConfig.id
                      ? 'bg-indigo-600/20 text-indigo-400'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  } ${denied ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    <tabConfig.icon className="w-4 h-4" />
                    {tabConfig.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
};
