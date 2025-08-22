// Keyboard shortcuts hook
// Provides global keyboard shortcut functionality

import { useEffect, useCallback } from 'react';
import { logger } from './useLogger';

// Default shortcuts configuration
const defaultShortcuts = {
  // File operations
  'ctrl+a': { action: 'selectAll', description: 'Select all files' },
  'ctrl+d': { action: 'deselectAll', description: 'Deselect all files' },
  'delete': { action: 'removeSelected', description: 'Remove selected files from list' },
  
  // Navigation
  'ctrl+1': { action: 'switchToFiles', description: 'Switch to Files tab' },
  'ctrl+2': { action: 'switchToRename', description: 'Switch to Rename tab' },
  'ctrl+3': { action: 'switchToSettings', description: 'Switch to Settings tab' },
  
  // Operations
  'ctrl+r': { action: 'previewRename', description: 'Preview rename operation' },
  'ctrl+enter': { action: 'executeRename', description: 'Execute rename operation' },
  'ctrl+z': { action: 'undo', description: 'Undo last operation' },
  'ctrl+shift+z': { action: 'redo', description: 'Redo last undone operation' },
  
  // UI
  'f12': { action: 'toggleTerminal', description: 'Toggle terminal visibility' },
  'escape': { action: 'closeModals', description: 'Close open modals/dialogs' },
  'ctrl+,': { action: 'openSettings', description: 'Open settings' },
  
  // Help
  'f1': { action: 'showHelp', description: 'Show help' },
  'ctrl+?': { action: 'showShortcuts', description: 'Show keyboard shortcuts' }
};

const useKeyboardShortcuts = (shortcuts = {}, enabled = true) => {
  // Merge default shortcuts with custom ones
  const allShortcuts = { ...defaultShortcuts, ...shortcuts };

  // Convert key combinations to a normalized format
  const normalizeKey = useCallback((event) => {
    const keys = [];
    
    if (event.ctrlKey || event.metaKey) keys.push('ctrl');
    if (event.shiftKey) keys.push('shift');
    if (event.altKey) keys.push('alt');
    
    const key = event.key.toLowerCase();
    
    // Handle special keys
    const specialKeys = {
      ' ': 'space',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right',
      'enter': 'enter',
      'escape': 'escape',
      'backspace': 'backspace',
      'delete': 'delete',
      'tab': 'tab'
    };
    
    const normalizedKey = specialKeys[key] || key;
    keys.push(normalizedKey);
    
    return keys.join('+');
  }, []);

  // Check if current focus allows shortcuts
  const shouldHandleShortcut = useCallback((event) => {
    const activeElement = document.activeElement;
    const tagName = activeElement?.tagName?.toLowerCase();
    
    // Don't handle shortcuts if user is typing in inputs
    const inputElements = ['input', 'textarea', 'select'];
    const isEditableContent = activeElement?.contentEditable === 'true';
    
    if (inputElements.includes(tagName) || isEditableContent) {
      // Allow some shortcuts even in inputs (like Ctrl+A, Ctrl+Z)
      const allowedInInputs = ['ctrl+a', 'ctrl+z', 'ctrl+shift+z', 'escape', 'f1', 'f12'];
      const keyCombo = normalizeKey(event);
      return allowedInInputs.includes(keyCombo);
    }
    
    return true;
  }, [normalizeKey]);

  // Handle keyboard events
  const handleKeyDown = useCallback((event) => {
    if (!enabled || !shouldHandleShortcut(event)) {
      return;
    }

    const keyCombo = normalizeKey(event);
    const shortcut = allShortcuts[keyCombo];
    
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      
      logger.debug(`Keyboard shortcut triggered: ${keyCombo}`, {
        action: shortcut.action,
        description: shortcut.description
      });
      
      // Dispatch custom event for the shortcut
      const shortcutEvent = new CustomEvent('keyboardShortcut', {
        detail: {
          action: shortcut.action,
          description: shortcut.description,
          keyCombo: keyCombo,
          originalEvent: event
        }
      });
      
      document.dispatchEvent(shortcutEvent);
    }
  }, [enabled, shouldHandleShortcut, normalizeKey, allShortcuts]);

  // Set up event listeners
  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [handleKeyDown, enabled]);

  // Helper function to register shortcuts dynamically
  const registerShortcut = useCallback((keyCombo, action, description) => {
    allShortcuts[keyCombo] = { action, description };
    logger.info(`Registered keyboard shortcut: ${keyCombo} -> ${action}`, { description });
  }, [allShortcuts]);

  // Helper function to unregister shortcuts
  const unregisterShortcut = useCallback((keyCombo) => {
    if (allShortcuts[keyCombo]) {
      delete allShortcuts[keyCombo];
      logger.info(`Unregistered keyboard shortcut: ${keyCombo}`);
    }
  }, [allShortcuts]);

  // Get all registered shortcuts
  const getShortcuts = useCallback(() => {
    return { ...allShortcuts };
  }, [allShortcuts]);

  // Show shortcuts help
  const showShortcutsHelp = useCallback(() => {
    const shortcuts = getShortcuts();
    const helpText = Object.entries(shortcuts)
      .map(([key, info]) => `${key.toUpperCase()}: ${info.description}`)
      .join('\n');
    
    const message = `🎹 Keyboard Shortcuts:\n\n${helpText}\n\nTip: Some shortcuts work even when typing in input fields.`;
    alert(message);
  }, [getShortcuts]);

  return {
    registerShortcut,
    unregisterShortcut,
    getShortcuts,
    showShortcutsHelp,
    normalizeKey
  };
};

// Hook for handling specific shortcut actions
const useShortcutHandler = (handlers = {}) => {
  useEffect(() => {
    const handleShortcut = (event) => {
      const { action, keyCombo, description } = event.detail;
      
      if (handlers[action]) {
        logger.debug(`Executing shortcut handler for: ${action}`, { keyCombo, description });
        handlers[action](event.detail);
      } else {
        logger.warn(`No handler registered for shortcut action: ${action}`, { keyCombo });
      }
    };

    document.addEventListener('keyboardShortcut', handleShortcut);
    
    return () => {
      document.removeEventListener('keyboardShortcut', handleShortcut);
    };
  }, [handlers]);
};

// Component for displaying keyboard shortcuts help
const KeyboardShortcutsHelp = ({ shortcuts, isVisible, onClose }) => {
  if (!isVisible) return null;

  const groupedShortcuts = {
    'File Operations': {},
    'Navigation': {},
    'Operations': {},
    'UI': {},
    'Help': {}
  };

  // Group shortcuts by category
  Object.entries(shortcuts || defaultShortcuts).forEach(([key, info]) => {
    const action = info.action;
    
    if (action.includes('select') || action.includes('remove')) {
      groupedShortcuts['File Operations'][key] = info;
    } else if (action.includes('switch') || action.includes('navigate')) {
      groupedShortcuts['Navigation'][key] = info;
    } else if (action.includes('rename') || action.includes('undo') || action.includes('execute')) {
      groupedShortcuts['Operations'][key] = info;
    } else if (action.includes('toggle') || action.includes('close') || action.includes('open')) {
      groupedShortcuts['UI'][key] = info;
    } else if (action.includes('help') || action.includes('shortcuts')) {
      groupedShortcuts['Help'][key] = info;
    } else {
      groupedShortcuts['UI'][key] = info; // Default to UI
    }
  });

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>🎹 Keyboard Shortcuts</h2>
          <button className="close-btn" onClick={onClose}>❌</button>
        </div>
        
        <div className="shortcuts-content">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => {
            if (Object.keys(categoryShortcuts).length === 0) return null;
            
            return (
              <div key={category} className="shortcuts-category">
                <h3>{category}</h3>
                <div className="shortcuts-list">
                  {Object.entries(categoryShortcuts).map(([key, info]) => (
                    <div key={key} className="shortcut-item">
                      <div className="shortcut-key">
                        {key.split('+').map((k, i) => (
                          <span key={i}>
                            <kbd>{k.toUpperCase()}</kbd>
                            {i < key.split('+').length - 1 && <span className="plus">+</span>}
                          </span>
                        ))}
                      </div>
                      <div className="shortcut-description">{info.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="shortcuts-footer">
          <p>💡 Tip: Press <kbd>ESC</kbd> to close this dialog</p>
        </div>
      </div>
    </div>
  );
};

export { useKeyboardShortcuts, useShortcutHandler, KeyboardShortcutsHelp, defaultShortcuts };