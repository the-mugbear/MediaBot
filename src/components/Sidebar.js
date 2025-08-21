import React from 'react';

const Sidebar = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'files', label: 'Files', icon: '📁' },
    { id: 'rename', label: 'Rename', icon: '✏️' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>MediaBot</h2>
        <p>Media File Organizer</p>
      </div>
      
      <nav className="sidebar-nav">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="app-info">
          <small>Version 1.0.0</small>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;