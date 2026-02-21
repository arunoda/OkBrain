"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChatContext } from "../context/ChatContext";
import { Button } from "./primitive/Button";
import {
  Plus,
  MessageSquarePlus,
  FileText,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Trash2,
  X,
  MessageSquare,
  Pin,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Brain,
  LogOut,
  FilePlus,
  BrainCircuit,
  UserCircle
} from "lucide-react";
import "./Sidebar.module.css";

// Combined item type for sidebar
interface SidebarItem {
  id: string;
  title: string;
  folder_id?: string | null;
  updated_at: string;
  type: 'chat' | 'document';
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    conversations,
    documents,
    folders,
    expandedFolders,
    defaultFolderId,
    sidebarOpen,
    sidebarCollapsed,
    sidebarWidth,
    isCreatingFolder,
    newFolderName,
    editingFolderId,
    editingFolderName,
    draggedConversation,
    draggedDocument,
    dragOverFolder,

    toggleFolder,
    setSidebarOpen,
    setSidebarCollapsed,
    setSidebarWidth,
    setIsCreatingFolder,
    setNewFolderName,
    setEditingFolderId,
    setEditingFolderName,
    setDraggedConversation,
    setDraggedDocument,
    setDragOverFolder,
    setDefaultFolderId,
    setDeleteConfirm,
    createFolder,
    createDocument,
    updateFolder,
    moveConversationToFolder,
    moveDocumentToFolder,
    deleteItem,
    hasMoreSidebarItems,
    loadMoreSidebarItems,
    isLoadingMoreSidebarItems,
    location,
  } = useChatContext();

  const [mounted, setMounted] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [clientSideWidth, setClientSideWidth] = useState<number | null>(null);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
    // Set client-side width after hydration
    setClientSideWidth(sidebarWidth);

    // Fetch user info
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.email) setUser(data);
      })
      .catch(err => console.error("Failed to fetch user:", err));
  }, [sidebarWidth]);

  // Handle resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate new width based on mouse position
      const newWidth = e.clientX;
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, setSidebarWidth]);

  const startNewChat = () => {
    // Hard reload to home page to reset all state
    window.location.href = '/';
  };

  const startNewDoc = async () => {
    const doc = await createDocument();
    if (doc) {
      router.push(`/doc/${doc.id}`);
      setSidebarOpen(false);
    }
  };

  const selectConversation = (id: string) => {
    router.push(`/chat/${id}`);
    setSidebarOpen(false);
  };

  const selectDocument = (id: string) => {
    router.push(`/doc/${id}`);
    setSidebarOpen(false);
  };

  const navigateToMe = () => {
    router.push('/me');
    setSidebarOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleDeleteFolderClick = (e: React.MouseEvent, folderId: string, name: string) => {
    e.stopPropagation();
    setDeleteConfirm({ id: folderId, title: name, type: 'folder' });
  };

  const toggleDefaultFolder = (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (defaultFolderId === folderId) {
      setDefaultFolderId(null);
    } else {
      setDefaultFolderId(folderId);
    }
  };

  const handleDragStart = (e: React.DragEvent, itemId: string, itemType: 'chat' | 'document') => {
    if (itemType === 'chat') {
      setDraggedConversation(itemId);
    } else {
      setDraggedDocument(itemId);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: itemId, type: itemType }));
  };

  const handleDragEnd = () => {
    setDraggedConversation(null);
    setDraggedDocument(null);
    setDragOverFolder(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(folderId);
  };

  const handleDragLeave = () => {
    setDragOverFolder(null);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type === 'chat') {
        moveConversationToFolder(data.id, folderId);
      } else if (data.type === 'document') {
        moveDocumentToFolder(data.id, folderId);
      }
    } catch {
      // Fallback for old format
      const conversationId = e.dataTransfer.getData('text/plain');
      if (conversationId) {
        moveConversationToFolder(conversationId, folderId);
      }
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, itemId: string, title: string, itemType: 'conversation' | 'document') => {
    e.stopPropagation();
    setDeleteConfirm({ id: itemId, title, type: itemType });
  };

  // Long press handler for mobile
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressDelay = 500; // 500ms for long press

  useEffect(() => {
    return () => {
      // Cleanup timer on unmount
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent, itemId: string, title: string, itemType: 'conversation' | 'document') => {
    longPressTimerRef.current = setTimeout(() => {
      setDeleteConfirm({ id: itemId, title, type: itemType });
      longPressTimerRef.current = null;
    }, longPressDelay);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const allItems = useMemo(() => {
    const chatItems: SidebarItem[] = conversations
      .filter((c) => c.id)
      .map((c) => ({
        id: c.id,
        title: c.title,
        folder_id: c.folder_id,
        updated_at: c.updated_at,
        type: 'chat' as const,
      }));
    const docItems: SidebarItem[] = documents
      .filter((d) => d.id)
      .map((d) => ({
        id: d.id,
        title: d.title,
        folder_id: d.folder_id,
        updated_at: d.updated_at,
        type: 'document' as const,
      }));
    return [...chatItems, ...docItems].sort(
      (a, b) => {
        const parseDate = (s: string) => new Date(s.includes(' ') && !s.includes('Z') ? s.replace(' ', 'T') + 'Z' : s);
        return parseDate(b.updated_at).getTime() - parseDate(a.updated_at).getTime();
      }
    );
  }, [conversations, documents]);

  const groupedItems = useMemo(() => {
    if (!mounted) {
      return {
        "Last 24 Hours": [],
        "Previous 7 Days": [],
        Older: [],
      };
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const groups: { [key: string]: SidebarItem[] } = {
      "Last 24 Hours": [],
      "Previous 7 Days": [],
      Older: [],
    };

    const parseSqliteDate = (s: string) => new Date(s.includes(' ') && !s.includes('Z') ? s.replace(' ', 'T') + 'Z' : s);

    allItems.filter((item) => !item.folder_id).forEach((item) => {
      const date = parseSqliteDate(item.updated_at);
      if (date >= oneDayAgo) {
        groups["Last 24 Hours"].push(item);
      } else if (date >= sevenDaysAgo) {
        groups["Previous 7 Days"].push(item);
      } else {
        groups["Older"].push(item);
      }
    });

    return groups;
  }, [allItems, mounted]);

  return (
    <>
      {/* Sidebar overlay for mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`sidebar ${sidebarOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}
        {...(clientSideWidth !== null && {
          style: {
            '--sidebar-width': `${clientSideWidth}px`
          } as React.CSSProperties
        })}
      >
        <div className="sidebar-header">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: sidebarCollapsed ? '0' : '8px',
            width: '100%'
          }}>
            <div className="logo" onClick={() => { router.push('/'); setSidebarOpen(false); }} style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
              <div className="logo-icon">
                <Brain size={20} strokeWidth={2.5} />
              </div>
              {!sidebarCollapsed && <span style={{ marginRight: '4px' }}>OkBrain</span>}
            </div>

            {!sidebarCollapsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <button
                  onClick={navigateToMe}
                  title="Profile"
                  className="header-icon-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  <UserCircle size={18} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="new-buttons-row">
              <Button variant="brand" className="new-chat-btn" icon={<MessageSquarePlus size={16} />} onClick={startNewChat}>
                Chat
              </Button>
              <Button variant="secondary" className="new-doc-btn" icon={<FilePlus size={16} />} onClick={startNewDoc}>
                Doc
              </Button>
            </div>
          )}
          <button
            className="sidebar-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarCollapsed(!sidebarCollapsed);
            }}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {/* Mobile close button */}
          <button
            className="sidebar-close-mobile"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(false);
            }}
            title="Close sidebar"
          >
            <X size={24} />
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="chat-history">
            {/* New Folder Button */}
            {!isCreatingFolder ? (
              <button
                className="new-folder-btn"
                onClick={() => setIsCreatingFolder(true)}
              >
                <FolderPlus size={16} className="folder-icon" /> New Folder
              </button>
            ) : (
              <div className="new-folder-input-container">
                <input
                  type="text"
                  className="new-folder-input"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createFolder();
                    if (e.key === 'Escape') {
                      setIsCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  autoFocus
                />
                <button className="new-folder-submit" onClick={createFolder}><Plus size={16} /></button>
                <button
                  className="new-folder-cancel"
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName("");
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Folders */}
            {folders.map((folder) => {
              const folderItems = allItems.filter((item) => item.folder_id === folder.id);
              const isExpanded = expandedFolders.has(folder.id);
              const isDragOver = dragOverFolder === folder.id;

              return (
                <div key={folder.id} className="folder-container">
                  <div
                    className={`folder-header ${isDragOver ? 'drag-over' : ''} ${defaultFolderId === folder.id ? 'is-default' : ''}`}
                    aria-expanded={isExpanded}
                    onClick={() => toggleFolder(folder.id)}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, folder.id)}
                  >
                    <span className="folder-expand-icon">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    {editingFolderId === folder.id ? (
                      <input
                        type="text"
                        className="folder-name-input"
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateFolder(folder.id, editingFolderName);
                          if (e.key === 'Escape') {
                            setEditingFolderId(null);
                            setEditingFolderName("");
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="folder-name"
                        title={folder.name}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingFolderId(folder.id);
                          setEditingFolderName(folder.name);
                        }}
                      >
                        {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />} {folder.name}
                      </span>
                    )}
                    <button
                      className="folder-delete"
                      onClick={(e) => handleDeleteFolderClick(e, folder.id, folder.name)}
                      title="Delete folder"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      className={`folder-pin ${defaultFolderId === folder.id ? 'is-pinned' : ''}`}
                      onClick={(e) => toggleDefaultFolder(e, folder.id)}
                      title={defaultFolderId === folder.id ? "Unset as default folder" : "Set as default folder for new items"}
                    >
                      <Pin size={14} />
                    </button>
                    <span className="folder-count">{folderItems.length}</span>
                  </div>
                  {isExpanded && (
                    <div className="folder-conversations">
                      {folderItems.length === 0 ? (
                        <div className="folder-empty">Drop items here</div>
                      ) : (
                        folderItems.map((item) => (
                          <div
                            key={`${item.type}-${item.id}`}
                            className={`chat-item ${item.type === 'chat' ? (pathname === `/chat/${item.id}` ? "active" : "") : (pathname === `/doc/${item.id}` ? "active" : "")} ${item.type === 'chat' ? (draggedConversation === item.id ? "dragging" : "") : (draggedDocument === item.id ? "dragging" : "")}`}
                            onClick={() => item.type === 'chat' ? selectConversation(item.id) : selectDocument(item.id)}
                            onTouchStart={(e) => handleTouchStart(e, item.id, item.title, item.type === 'chat' ? 'conversation' : 'document')}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                            draggable
                            onDragStart={(e) => handleDragStart(e, item.id, item.type)}
                            onDragEnd={handleDragEnd}
                            onMouseEnter={() => setHoveredItemId(item.id)}
                            onMouseLeave={() => setHoveredItemId(null)}
                          >
                            <span className="chat-item-icon">
                              {item.type === 'chat' ? <MessageSquare size={14} /> : <FileText size={14} />}
                            </span>
                            <span className="chat-item-title" title={item.title}>{item.title}</span>
                            <button
                              className="chat-item-delete"
                              onClick={(e) => handleDeleteClick(e, item.id, item.title, item.type === 'chat' ? 'conversation' : 'document')}
                              title={item.type === 'chat' ? "Delete conversation" : "Delete document"}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Uncategorized items (no folder) */}
            <div
              className={`uncategorized-section ${dragOverFolder === 'uncategorized' ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, 'uncategorized')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, null)}
            >
              {/* Ungrouped header - always visible as drop target */}
              <div className="ungrouped-header">
                <Library size={16} />
                <span>All Items</span>
              </div>
              {Object.entries(groupedItems).map(
                ([group, items]) =>
                  items.length > 0 && (
                    <div key={group}>
                      <div className="history-section-title">{group}</div>
                      {items.map((item) => (
                        <div
                          key={`${item.type}-${item.id}`}
                          className={`chat-item ${item.type === 'chat' ? (pathname === `/chat/${item.id}` ? "active" : "") : (pathname === `/doc/${item.id}` ? "active" : "")} ${item.type === 'chat' ? (draggedConversation === item.id ? "dragging" : "") : (draggedDocument === item.id ? "dragging" : "")}`}
                          onClick={() => item.type === 'chat' ? selectConversation(item.id) : selectDocument(item.id)}
                          onTouchStart={(e) => handleTouchStart(e, item.id, item.title, item.type === 'chat' ? 'conversation' : 'document')}
                          onTouchEnd={handleTouchEnd}
                          onTouchMove={handleTouchMove}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item.id, item.type)}
                          onDragEnd={handleDragEnd}
                          onMouseEnter={() => setHoveredItemId(item.id)}
                          onMouseLeave={() => setHoveredItemId(null)}
                        >
                          <span className="chat-item-icon">
                            {item.type === 'chat' ? <MessageSquare size={14} /> : <FileText size={14} />}
                          </span>
                          <span className="chat-item-title" title={item.title}>{item.title}</span>
                          <button
                            className="chat-item-delete"
                            onClick={(e) => handleDeleteClick(e, item.id, item.title, item.type === 'chat' ? 'conversation' : 'document')}
                            title={item.type === 'chat' ? "Delete conversation" : "Delete document"}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
              )}
              {/* Load More Button */}
              {hasMoreSidebarItems && (
                <div style={{ padding: '8px 12px' }}>
                  <Button
                    fullWidth
                    variant="secondary"
                    onClick={loadMoreSidebarItems}
                    disabled={isLoadingMoreSidebarItems}
                    style={{ justifyContent: 'center', opacity: 0.7 }}
                  >
                    {isLoadingMoreSidebarItems ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sidebar Footer with Account Info & Logout */}
        {!sidebarCollapsed && user && (
          <div className="sidebar-footer">
            <div className="user-account" title={user.email}>
              <div className="user-avatar">{user.email[0].toUpperCase()}</div>
              <span className="user-email">{user.email}</span>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        )}
        {sidebarCollapsed && user && (
          <div className="sidebar-footer collapsed">
            <button className="logout-btn" onClick={handleLogout} title={`Logout (${user.email})`}>
              <LogOut size={18} />
            </button>
          </div>
        )}

        {/* Resize handle - only show on desktop when not collapsed */}
        {!sidebarCollapsed && (
          <div
            className="sidebar-resize-handle"
            onMouseDown={handleMouseDown}
            title="Drag to resize"
          />
        )}
      </aside >
    </>
  );
}

