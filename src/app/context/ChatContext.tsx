"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { getCookie, setCookie } from "../utils/cookies";
import type { ModelsConfig, ModelInfo } from "@/lib/ai/client-types";
import { useLocation, UseLocationResult } from "@/hooks/useLocation";

// Image attachment type (for temporary display, not persisted)
interface ImageAttachment {
  mimeType: string;
  base64: string;
  previewUrl: string; // Object URL for display
}

// File attachment type (uploaded to FILE API)
export interface FileAttachment {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  uploadedAt: string;
  expirationTime: string;
  previewUrl?: string; // Object URL for local preview
}

interface Folder {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface Conversation {
  id: string;
  title: string;
  folder_id?: string | null;
  grounding_enabled?: number;
  response_mode?: string;
  ai_provider?: string;
  document_ids?: string[];
  created_at: string;
  updated_at: string;
}

interface Document {
  id: string;
  title: string;
  content: string;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

type ResponseMode = 'quick' | 'detailed';

interface ChatContextType {
  // Model configuration from server
  modelsConfig: ModelsConfig;
  getCurrentModel: () => ModelInfo | undefined;

  conversations: Conversation[];
  documents: Document[];
  folders: Folder[];
  expandedFolders: Set<string>;
  defaultFolderId: string | null;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarPageSize: number;
  sidebarOffset: number;
  hasMoreSidebarItems: boolean;
  isLoadingMoreSidebarItems: boolean;
  loadMoreSidebarItems: () => Promise<void>;
  isCreatingFolder: boolean;
  newFolderName: string;
  editingFolderId: string | null;
  editingFolderName: string;
  draggedConversation: string | null;
  draggedDocument: string | null;
  dragOverFolder: string | null;
  deleteConfirm: { id: string; title: string; type: 'conversation' | 'folder' | 'document' } | null;

  // Input state (shared across pages)
  input: string;
  setInput: (input: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isCancelling: boolean;
  setIsCancelling: (cancelling: boolean) => void;
  thinking: boolean;
  setThinking: (thinking: boolean) => void;
  responseMode: ResponseMode;
  setResponseMode: (mode: ResponseMode) => void;
  aiProvider: string;
  setAiProvider: (provider: string) => void;
  saveAiProviderPreference: (provider: string) => void;
  sendMessageRef: React.MutableRefObject<((options?: { message?: string; provider?: string; skipProviderUpdate?: boolean; endpoint?: string; thinking?: boolean }) => Promise<void>) | null>;
  stopStreamingRef: React.MutableRefObject<(() => void) | null>;
  focusInputRef: React.MutableRefObject<(() => void) | null>;

  // Image attachment (temporary, not persisted)
  imageAttachment: ImageAttachment | null;
  setImageAttachment: (image: ImageAttachment | null) => void;
  clearImageAttachment: () => void;

  // File attachments (uploaded to FILE API, persisted)
  fileAttachments: FileAttachment[];
  setFileAttachments: (files: FileAttachment[]) => void;
  addFileAttachment: (file: FileAttachment) => void;
  removeFileAttachment: (uri: string) => void;
  clearFileAttachments: () => void;

  // Actions
  loadConversations: () => Promise<void>;
  loadDocuments: () => Promise<void>;
  loadFolders: () => Promise<void>;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  toggleFolder: (folderId: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setIsCreatingFolder: (creating: boolean) => void;
  setNewFolderName: (name: string) => void;
  setEditingFolderId: (id: string | null) => void;
  setEditingFolderName: (name: string) => void;
  setDraggedConversation: (id: string | null) => void;
  setDraggedDocument: (id: string | null) => void;
  setDragOverFolder: (id: string | null) => void;
  setDefaultFolderId: (id: string | null) => void;
  setDeleteConfirm: (confirm: { id: string; title: string; type: 'conversation' | 'folder' | 'document' } | null) => void;
  createFolder: () => Promise<void>;
  createDocument: () => Promise<Document | null>;
  updateFolder: (folderId: string, name: string) => Promise<void>;
  moveConversationToFolder: (conversationId: string, folderId: string | null) => Promise<void>;
  moveDocumentToFolder: (documentId: string, folderId: string | null) => Promise<void>;
  deleteItem: () => Promise<void>;

  // Location
  location: UseLocationResult;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({
  children,
  modelsConfig,
  initialSidebarCollapsed = false,
  initialAiProvider,
  initialResponseMode = 'detailed',
  initialThinking = true,
}: {
  children: ReactNode;
  modelsConfig: ModelsConfig;
  initialSidebarCollapsed?: boolean;
  initialAiProvider?: string;
  initialResponseMode?: 'quick' | 'detailed';
  initialThinking?: boolean;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [defaultFolderId, setDefaultFolderIdState] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(initialSidebarCollapsed);

  // Pagination state
  const SIDEBAR_PAGE_SIZE = 50;
  const [sidebarOffset, setSidebarOffset] = useState(0);
  const [hasMoreSidebarItems, setHasMoreSidebarItems] = useState(true);
  const [isLoadingMoreSidebarItems, setIsLoadingMoreSidebarItems] = useState(false);

  // Initialize sidebar width from cookie synchronously to avoid hydration mismatch
  const [sidebarWidth, setSidebarWidthState] = useState(() => {
    if (typeof window === 'undefined') return 280; // SSR default
    const savedWidth = getCookie('sidebarWidth');
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      if (!isNaN(width) && width >= 200 && width <= 600) {
        return width;
      }
    }
    return 280;
  });

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [draggedConversation, setDraggedConversation] = useState<string | null>(null);
  const [draggedDocument, setDraggedDocument] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string; type: 'conversation' | 'folder' | 'document' } | null>(null);

  // Input state (shared across pages)
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [thinking, setThinking] = useState(initialThinking);
  const [responseMode, setResponseMode] = useState<ResponseMode>(initialResponseMode);
  const [aiProvider, setAiProviderState] = useState<string>(initialAiProvider ?? modelsConfig.defaultModelId);
  const sendMessageRef = useRef<((options?: { message?: string; provider?: string; skipProviderUpdate?: boolean; endpoint?: string; thinking?: boolean }) => Promise<void>) | null>(null);
  const stopStreamingRef = useRef<(() => void) | null>(null);
  const focusInputRef = useRef<(() => void) | null>(null);

  // Image attachment (temporary, not persisted)
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null);

  // File attachments (uploaded to FILE API, persisted)
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);

  // Location
  const location = useLocation();

  // Load initial data
  useEffect(() => {
    // loadConversations(); // Disabled in favor of loadMoreSidebarItems
    // loadDocuments();     // Disabled in favor of loadMoreSidebarItems
    loadFolders();


    // Load saved preferences from localStorage
    const savedExpandedFolders = localStorage.getItem('expandedFolders');
    if (savedExpandedFolders) {
      try {
        setExpandedFolders(new Set(JSON.parse(savedExpandedFolders)));
      } catch (e) {
        // Ignore parse errors
      }
    }
    const savedDefaultFolder = localStorage.getItem('defaultFolderId');
    if (savedDefaultFolder) {
      setDefaultFolderIdState(savedDefaultFolder);
    }
    // Note: responseMode, aiProvider, and thinking are now loaded from server via SSR
    // and set by ChatView using the initial* props
  }, []);

  // Track if preferences have been initialized to avoid saving default values on mount
  const prefsInitializedRef = useRef(false);

  // Save preferences to server when they change
  useEffect(() => {
    if (!prefsInitializedRef.current) return;
    fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'chat:responseMode', value: responseMode }),
    }).catch(() => {/* ignore errors */ });
  }, [responseMode]);

  useEffect(() => {
    if (!prefsInitializedRef.current) return;
    fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'chat:thinking', value: String(thinking) }),
    }).catch(() => {/* ignore errors */ });
  }, [thinking]);

  const saveAiProviderPreference = useCallback((provider: string) => {
    fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'chat:aiProvider', value: provider }),
    }).catch(() => {/* ignore errors */ });
  }, []);

  // Mark preferences as initialized after first render
  useEffect(() => {
    prefsInitializedRef.current = true;
  }, []);

  const loadConversations = useCallback(async () => {
    // Legacy: keeping this for now but it should ideally be replaced by unified loading
    // We will let loadMoreSidebarItems handle the main list population
  }, []);

  const loadDocuments = useCallback(async () => {
    // Legacy: keeping this for now but it should ideally be replaced by unified loading
    // We will let loadMoreSidebarItems handle the main list population
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      setFolders(data);

      // Load items for folders (populate conversation/documents state with folder items)
      // This ensures folder items are available even if they are not in the top 50 recent
      // Note: This is an optimization; ideally we'd have a specific API for "all folder items"
      // avoiding fetching everything. For now, we fetch uncategorized via pagination,
      // and we might need to fetch folder contents separately.
      // However, to keep it simple and compliant with "For folders, keep it like that",
      // we need to make sure folder items are loaded.

      // Strategy:
      // 1. Fetch initial paginated list (uncategorized).
      // 2. Fetch all items (legacy) ?? No, that defeats pagination.
      // 3. We typically only need to load items for expanded folders, or all folders.
      // Let's implement a separate fetch for folder items.

      for (const folder of data) {
        const folderItemsRes = await fetch(`/api/sidebar/items?type=folder&folderId=${folder.id}`);
        if (folderItemsRes.ok) {
          const items = await folderItemsRes.json();
          processSidebarItems(items);
        }
      }

    } catch (error) {
      console.error("Failed to load folders:", error);
    }
  }, []);

  const processSidebarItems = useCallback((items: any[]) => {
    const newConvs: any[] = [];
    const newDocs: any[] = [];

    items.forEach(item => {
      if (item.type === 'chat') {
        newConvs.push(item);
      } else {
        newDocs.push(item);
      }
    });

    setConversations(prev => {
      const existingIds = new Set(prev.map(c => c.id));
      const filtered = newConvs.filter(c => !existingIds.has(c.id));
      return [...prev, ...filtered];
    });

    setDocuments(prev => {
      const existingIds = new Set(prev.map(d => d.id));
      const filtered = newDocs.filter(d => !existingIds.has(d.id));
      return [...prev, ...filtered];
    });
  }, []);

  const loadMoreSidebarItems = useCallback(async () => {
    if (!hasMoreSidebarItems || isLoadingMoreSidebarItems) return;

    setIsLoadingMoreSidebarItems(true);
    try {
      const res = await fetch(`/api/sidebar/items?type=uncategorized&limit=${SIDEBAR_PAGE_SIZE}&offset=${sidebarOffset}`);
      if (!res.ok) throw new Error("Failed to fetch sidebar items");

      const items = await res.json();
      if (items.length < SIDEBAR_PAGE_SIZE) {
        setHasMoreSidebarItems(false);
      }

      if (items.length > 0) {
        processSidebarItems(items);
        setSidebarOffset(prev => prev + SIDEBAR_PAGE_SIZE);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMoreSidebarItems(false);
    }
  }, [hasMoreSidebarItems, sidebarOffset, processSidebarItems, isLoadingMoreSidebarItems]);

  // Initial load
  useEffect(() => {
    loadMoreSidebarItems();
  }, []); // Run once on mount (managed by hasMore check mostly, but we want explicit start)


  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      localStorage.setItem('expandedFolders', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const setDefaultFolderId = useCallback((id: string | null) => {
    setDefaultFolderIdState(id);
    if (id) {
      localStorage.setItem('defaultFolderId', id);
    } else {
      localStorage.removeItem('defaultFolderId');
    }
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    setCookie('sidebarCollapsed', String(collapsed));
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    // Constrain width between 200px and 600px
    const constrainedWidth = Math.min(Math.max(width, 200), 600);
    setSidebarWidthState(constrainedWidth);
    setCookie('sidebarWidth', String(constrainedWidth));
  }, []);

  const createFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      const folder = await res.json();
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName("");
      setIsCreatingFolder(false);
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.add(folder.id);
        localStorage.setItem('expandedFolders', JSON.stringify([...next]));
        return next;
      });
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  }, [newFolderName]);

  const updateFolder = useCallback(async (folderId: string, name: string) => {
    try {
      await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name } : f)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingFolderId(null);
      setEditingFolderName("");
    } catch (error) {
      console.error("Failed to update folder:", error);
    }
  }, []);

  const moveConversationToFolder = useCallback(async (conversationId: string, folderId: string | null) => {
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, folder_id: folderId } : c))
      );
    } catch (error) {
      console.error("Failed to move conversation:", error);
    }
    setDraggedConversation(null);
    setDragOverFolder(null);
  }, []);

  const moveDocumentToFolder = useCallback(async (documentId: string, folderId: string | null) => {
    try {
      await fetch(`/api/docs/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      setDocuments((prev) =>
        prev.map((d) => (d.id === documentId ? { ...d, folder_id: folderId } : d))
      );
    } catch (error) {
      console.error("Failed to move document:", error);
    }
    setDraggedDocument(null);
    setDragOverFolder(null);
  }, []);

  const createDocument = useCallback(async (): Promise<Document | null> => {
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Document",
          folder_id: defaultFolderId
        }),
      });
      if (!res.ok) {
        console.error("Failed to create document:", res.status, res.statusText);
        return null;
      }
      const doc = await res.json();
      if (!doc || !doc.id) {
        console.error("Document created without ID:", doc);
        return null;
      }
      setDocuments((prev) => [doc, ...prev]);
      return doc;
    } catch (error) {
      console.error("Failed to create document:", error);
      return null;
    }
  }, [defaultFolderId]);

  const clearImageAttachment = useCallback(() => {
    if (imageAttachment?.previewUrl) {
      URL.revokeObjectURL(imageAttachment.previewUrl);
    }
    setImageAttachment(null);
  }, [imageAttachment]);

  // File attachment functions
  const addFileAttachment = useCallback((file: FileAttachment) => {
    setFileAttachments((prev) => [...prev, file]);
  }, []);

  const removeFileAttachment = useCallback((uri: string) => {
    setFileAttachments((prev) => {
      const removed = prev.find((f) => f.uri === uri);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((f) => f.uri !== uri);
    });
  }, []);

  const clearFileAttachments = useCallback(() => {
    fileAttachments.forEach((file) => {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
    });
    setFileAttachments([]);
  }, [fileAttachments]);

  const getCurrentModel = useCallback(() => {
    return modelsConfig.models.find(m => m.id === aiProvider);
  }, [modelsConfig.models, aiProvider]);

  const setAiProvider = useCallback((provider: string) => {
    setAiProviderState(provider);
    // Clear attachments if the new model doesn't support file upload
    const model = modelsConfig.models.find(m => m.id === provider);
    if (!model?.capabilities.fileUpload) {
      clearFileAttachments();
      clearImageAttachment();
    }
  }, [modelsConfig.models, clearFileAttachments, clearImageAttachment]);

  const deleteItem = useCallback(async () => {
    if (!deleteConfirm) return;

    try {
      if (deleteConfirm.type === 'folder') {
        await fetch(`/api/folders/${deleteConfirm.id}`, { method: "DELETE" });
        setFolders((prev) => prev.filter((f) => f.id !== deleteConfirm.id));
        setConversations((prev) =>
          prev.map((c) => (c.folder_id === deleteConfirm.id ? { ...c, folder_id: null } : c))
        );
        setDocuments((prev) =>
          prev.map((d) => (d.folder_id === deleteConfirm.id ? { ...d, folder_id: null } : d))
        );
        if (defaultFolderId === deleteConfirm.id) {
          setDefaultFolderId(null);
        }
      } else if (deleteConfirm.type === 'document') {
        await fetch(`/api/docs/${deleteConfirm.id}`, { method: "DELETE" });
        setDocuments((prev) => prev.filter((d) => d.id !== deleteConfirm.id));
      } else {
        await fetch(`/api/conversations/${deleteConfirm.id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== deleteConfirm.id));
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Failed to delete:", error);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, defaultFolderId, setDefaultFolderId]);

  return (
    <ChatContext.Provider
      value={{
        modelsConfig,
        getCurrentModel,
        conversations,
        documents,
        folders,
        expandedFolders,
        defaultFolderId,
        sidebarOpen,
        sidebarCollapsed,
        sidebarWidth,
        sidebarPageSize: SIDEBAR_PAGE_SIZE,
        sidebarOffset,
        hasMoreSidebarItems,
        isLoadingMoreSidebarItems,
        loadMoreSidebarItems,
        isCreatingFolder,

        newFolderName,
        editingFolderId,
        editingFolderName,
        draggedConversation,
        draggedDocument,
        dragOverFolder,
        deleteConfirm,

        // Input state
        input,
        setInput,
        isLoading,
        setIsLoading,
        isCancelling,
        setIsCancelling,
        thinking,
        setThinking,
        responseMode,
        setResponseMode,
        aiProvider,
        setAiProvider,
        saveAiProviderPreference,
        sendMessageRef,
        stopStreamingRef,
        focusInputRef,

        // Image attachment
        imageAttachment,
        setImageAttachment,
        clearImageAttachment,

        // File attachments
        fileAttachments,
        setFileAttachments,
        addFileAttachment,
        removeFileAttachment,
        clearFileAttachments,

        loadConversations,
        loadDocuments,
        loadFolders,
        setConversations,
        setDocuments,
        setFolders,
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
        location,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

