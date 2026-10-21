import React from 'react';
import Navigation from './components/Navigation';
import CardGrid from './components/CardGrid';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="app">
      <Navigation />
      <CardGrid />
    </div>
  );
};

export default App;
