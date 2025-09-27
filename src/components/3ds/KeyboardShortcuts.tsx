import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  onTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  onDeleteSelected: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onFocusSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onOpen: () => void;
  onNew: () => void;
  onViewportChange: (viewport: 'perspective' | 'top' | 'front' | 'left') => void;
}

export const KeyboardShortcuts = ({
  onTransformMode,
  onDeleteSelected,
  onSelectAll,
  onDeselectAll,
  onFocusSelected,
  onUndo,
  onRedo,
  onSave,
  onOpen,
  onNew,
  onViewportChange
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const { key, ctrlKey, shiftKey, altKey } = event;

      // Transform modes
      if (!ctrlKey && !shiftKey && !altKey) {
        switch (key.toLowerCase()) {
          case 'w':
            event.preventDefault();
            onTransformMode('translate');
            break;
          case 'e':
            event.preventDefault();
            onTransformMode('rotate');
            break;
          case 'r':
            event.preventDefault();
            onTransformMode('scale');
            break;
          case 'delete':
          case 'backspace':
            event.preventDefault();
            onDeleteSelected();
            break;
          case 'f':
            event.preventDefault();
            onFocusSelected();
            break;
          case 'a':
            if (ctrlKey) {
              event.preventDefault();
              onSelectAll();
            }
            break;
          case 'd':
            if (ctrlKey) {
              event.preventDefault();
              onDeselectAll();
            }
            break;
        }
      }

      // File operations
      if (ctrlKey && !shiftKey && !altKey) {
        switch (key.toLowerCase()) {
          case 's':
            event.preventDefault();
            onSave();
            break;
          case 'o':
            event.preventDefault();
            onOpen();
            break;
          case 'n':
            event.preventDefault();
            onNew();
            break;
          case 'z':
            event.preventDefault();
            onUndo();
            break;
          case 'y':
            event.preventDefault();
            onRedo();
            break;
          case 'p':
            event.preventDefault();
            onViewportChange('perspective');
            break;
          case 't':
            event.preventDefault();
            onViewportChange('top');
            break;
          case 'l':
            event.preventDefault();
            onViewportChange('left');
            break;
        }
      }

      // Special case for Ctrl+F (front view) since 'f' is used for focus without Ctrl
      if (ctrlKey && !shiftKey && !altKey && key.toLowerCase() === 'f') {
        event.preventDefault();
        onViewportChange('front');
      }

      // Redo with Ctrl+Shift+Z
      if (ctrlKey && shiftKey && key.toLowerCase() === 'z') {
        event.preventDefault();
        onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onTransformMode,
    onDeleteSelected,
    onSelectAll,
    onDeselectAll,
    onFocusSelected,
    onUndo,
    onRedo,
    onSave,
    onOpen,
    onNew,
    onViewportChange
  ]);

  return null;
};