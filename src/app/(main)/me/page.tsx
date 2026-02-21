"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/app/components/primitive/Button";
import { Brain, Save, Edit2, X, Database, Trash2, FileText, Check, Search } from "lucide-react";
import "./me.css";

interface Fact {
  id: string;
  category: string;
  fact: string;
  extraction_count: number;
  created_at: string;
}

interface SearchResult {
  id: string;
  fact: string;
  category: string;
  last_extracted_at: string | null;
  distance: number;
}

interface FactSheetEntry {
  category: string;
  fact: string;
  score: number;
}

interface FactSheetResponse {
  facts: FactSheetEntry[];
  created_at: string;
  fact_count: number;
  dedup_log: string[] | null;
}

type Tab = "memory" | "facts" | "fact-sheet";
function TimeAgo({ date }: { date: string }) {
  const [timeAgo, setTimeAgo] = useState("");

  useEffect(() => {
    const update = () => {
      const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
      if (seconds < 60) {
        setTimeAgo("just now");
      } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        setTimeAgo(`${mins} ${mins === 1 ? "minute" : "minutes"} ago`);
      } else if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        setTimeAgo(`${hours} ${hours === 1 ? "hour" : "hours"} ago`);
      } else {
        const days = Math.floor(seconds / 86400);
        setTimeAgo(`${days} ${days === 1 ? "day" : "days"} ago`);
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [date]);

  return <span suppressHydrationWarning>{timeAgo}</span>;
}

export default function UserMemoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>("memory");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memoryText, setMemoryText] = useState("");

  // Facts state
  const [facts, setFacts] = useState<Fact[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);

  // Fact search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMaxDistance, setSearchMaxDistance] = useState(1.0);

  // Fact edit state
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editFactText, setEditFactText] = useState("");
  const [editFactCategory, setEditFactCategory] = useState("");

  // Fact Sheet state
  const [factSheet, setFactSheet] = useState<FactSheetResponse | null>(null);
  const [factSheetLoading, setFactSheetLoading] = useState(false);
  const [factSheetLoaded, setFactSheetLoaded] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editableText, setEditableText] = useState("");

  useEffect(() => {
    fetchMemory();
  }, []);

  useEffect(() => {
    if (activeTab === "facts" && facts.length === 0 && !factsLoading) {
      fetchFacts();
    }
    if (activeTab === "fact-sheet" && !factSheetLoaded && !factSheetLoading) {
      fetchFactSheet();
    }
  }, [activeTab]);

  // Debounced fact search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          limit: "20",
          max_distance: searchMaxDistance.toString(),
        });
        const res = await fetch(`/api/facts/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
        }
      } catch (error) {
        console.error("Failed to search facts:", error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMaxDistance]);

  const fetchMemory = async () => {
    try {
      const res = await fetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        setMemoryText(data.memory_text);
      }
    } catch (error) {
      console.error("Failed to fetch memory:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFacts = async () => {
    setFactsLoading(true);
    try {
      const res = await fetch("/api/facts");
      if (res.ok) {
        const data = await res.json();
        setFacts(data.facts.slice(0, 300));
      }
    } catch (error) {
      console.error("Failed to fetch facts:", error);
    } finally {
      setFactsLoading(false);
    }
  };

  const fetchFactSheet = async () => {
    setFactSheetLoading(true);
    try {
      const res = await fetch("/api/fact-sheet");
      if (res.ok) {
        const data = await res.json();
        setFactSheet(data);
      }
    } catch (error) {
      console.error("Failed to fetch fact sheet:", error);
    } finally {
      setFactSheetLoading(false);
      setFactSheetLoaded(true);
    }
  };

  const FACT_CATEGORIES = ["core", "technical", "project", "transient"];

  const handleEditFact = (fact: Fact) => {
    setEditingFactId(fact.id);
    setEditFactText(fact.fact);
    setEditFactCategory(fact.category);
  };

  const handleCancelEditFact = () => {
    setEditingFactId(null);
    setEditFactText("");
    setEditFactCategory("");
  };

  const handleSaveEditFact = async () => {
    if (!editingFactId || !editFactText.trim()) return;

    const prevFacts = [...facts];
    setFacts((prev) =>
      prev.map((f) =>
        f.id === editingFactId
          ? { ...f, fact: editFactText.trim(), category: editFactCategory }
          : f
      )
    );
    setEditingFactId(null);

    try {
      const res = await fetch("/api/facts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factId: editingFactId,
          category: editFactCategory,
          fact: editFactText.trim(),
        }),
      });
      if (!res.ok) {
        setFacts(prevFacts);
      }
    } catch {
      setFacts(prevFacts);
    }
  };

  const handleDeleteFact = async (factId: string) => {
    if (!confirm("Are you sure you want to delete this fact?")) return;

    setFacts((prev) => prev.filter((f) => f.id !== factId));
    try {
      const res = await fetch("/api/facts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factId }),
      });
      if (!res.ok) {
        fetchFacts();
      }
    } catch {
      fetchFacts();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryText: editableText }),
      });

      if (res.ok) {
        setMemoryText(editableText);
        setIsEditing(false);
      } else {
        alert("Failed to save memory.");
      }
    } catch (error) {
      console.error("Error saving:", error);
      alert("Error saving memory.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditableText("");
  };

  const handleManualEdit = () => {
    setEditableText(memoryText);
    setIsEditing(true);
  };

  if (loading) {
    return <div className="me-page-loading">Loading memory...</div>;
  }

  return (
    <div className="me-page-container">

      <div className="me-tabs">
        <button
          className={`me-tab ${activeTab === "memory" ? "me-tab-active" : ""}`}
          onClick={() => setActiveTab("memory")}
        >
          <Brain size={16} />
          User Memory
        </button>
        <button
          className={`me-tab ${activeTab === "facts" ? "me-tab-active" : ""}`}
          onClick={() => setActiveTab("facts")}
        >
          <Database size={16} />
          Facts{facts.length > 0 ? ` (${facts.length})` : ""}
        </button>
        <button
          className={`me-tab ${activeTab === "fact-sheet" ? "me-tab-active" : ""}`}
          onClick={() => setActiveTab("fact-sheet")}
        >
          <FileText size={16} />
          Fact Sheet
        </button>
      </div>

      <div className="me-page-content">
        {activeTab === "memory" && (
          <>
            <div className="me-page-header">
              <div className="me-header-main">
                <div className="me-page-title">
                  <Brain size={24} className="me-icon" />
                  <h1>User Memory</h1>
                </div>
                <div className="me-page-actions">
                  {!isEditing && (
                    <Button
                      variant="secondary"
                      onClick={handleManualEdit}
                      icon={<Edit2 size={16} />}
                    >
                      Edit
                    </Button>
                  )}
                  {isEditing && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={handleCancel}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="brand"
                        onClick={handleSave}
                        disabled={saving}
                        icon={<Save size={16} />}
                      >
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <p className="me-page-description">
                A custom prompt about you that gets included in every AI conversation. Write anything you want the AI to know — your name, preferences, how you like responses, etc.
              </p>
            </div>
            {isEditing && (
              <div className="me-editor-container">
                <textarea
                  className="me-textarea"
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  placeholder="Tell the AI about yourself... (supports markdown)"
                />
              </div>
            )}
            {!isEditing && (
              <div className="me-markdown-preview markdown-body">
                {memoryText ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {memoryText}
                  </ReactMarkdown>
                ) : (
                  <div className="me-empty-state">
                    <p>No memory recorded yet.</p>
                    <p>Click &quot;Edit&quot; to tell the AI about yourself.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "facts" && (
          <div className="me-facts-container">
            <div className="me-page-header">
              <div className="me-header-main">
                <div className="me-page-title">
                  <Database size={24} className="me-icon" />
                  <h1>Extracted Facts</h1>
                </div>
              </div>
              <p className="me-page-description">
                Facts are automatically extracted from your chat conversations. You can edit & delete them as needed.
              </p>
            </div>
            <div className="me-fact-search">
              <div className="me-fact-search-input-wrap">
                <Search size={16} className="me-fact-search-icon" />
                <input
                  type="text"
                  className="me-fact-search-input"
                  placeholder="Semantic search facts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="me-fact-search-clear"
                    onClick={() => setSearchQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="me-fact-search-slider">
                <label>Strictness</label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={searchMaxDistance}
                  onChange={(e) => setSearchMaxDistance(parseFloat(e.target.value))}
                />
                <span>{searchMaxDistance.toFixed(1)}</span>
              </div>
            </div>
            {searchLoading ? (
              <div className="me-empty-state">Searching...</div>
            ) : searchResults !== null ? (
              searchResults.length === 0 ? (
                <div className="me-empty-state">
                  <p>No matching facts found.</p>
                </div>
              ) : (
                <div className="me-facts-list">
                  {searchResults.map((result) => (
                    <div key={result.id} className="me-fact-item">
                      <span className={`me-fact-badge me-fact-badge-${result.category}`}>
                        {result.category}
                      </span>
                      <span className="me-fact-text">{result.fact}</span>
                      <span className="me-fact-distance">{result.distance.toFixed(2)}</span>
                      {result.last_extracted_at && (
                        <span className="me-fact-time">
                          <TimeAgo date={result.last_extracted_at} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : factsLoading ? (
              <div className="me-empty-state">Loading facts...</div>
            ) : facts.length === 0 ? (
              <div className="me-empty-state">
                <p>No facts extracted yet.</p>
                <p>Facts are automatically extracted from your conversations.</p>
              </div>
            ) : (
              <div className="me-facts-list">
                {facts.map((fact) => (
                  <div key={fact.id} className="me-fact-item">
                    {editingFactId === fact.id ? (
                      <>
                        <select
                          className="me-fact-category-select"
                          value={editFactCategory}
                          onChange={(e) => setEditFactCategory(e.target.value)}
                        >
                          {FACT_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <input
                          className="me-fact-edit-input"
                          value={editFactText}
                          onChange={(e) => setEditFactText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEditFact();
                            if (e.key === "Escape") handleCancelEditFact();
                          }}
                          autoFocus
                        />
                        <button
                          className="me-fact-action me-fact-action-save"
                          onClick={handleSaveEditFact}
                          title="Save"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="me-fact-action me-fact-action-cancel"
                          onClick={handleCancelEditFact}
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className={`me-fact-badge me-fact-badge-${fact.category}`}>
                          {fact.category}
                        </span>
                        <span className="me-fact-text">{fact.fact}</span>
                        {fact.extraction_count > 1 && (
                          <span className="me-fact-count">{fact.extraction_count}</span>
                        )}
                        <button
                          className="me-fact-action me-fact-action-edit"
                          onClick={() => handleEditFact(fact)}
                          title="Edit fact"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="me-fact-action me-fact-action-delete"
                          onClick={() => handleDeleteFact(fact.id)}
                          title="Delete fact"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "fact-sheet" && (
          <div className="me-facts-container">
            <div className="me-page-header">
              <div className="me-header-main">
                <div className="me-page-title">
                  <FileText size={24} className="me-icon" />
                  <h1>Fact Sheet</h1>
                </div>
              </div>
              <p className="me-page-description">
                This is a condensed set of facts included in every conversation alongside your User Memory. User Memory always takes priority.
              </p>
            </div>
            {factSheetLoading ? (
              <div className="me-empty-state">Loading fact sheet...</div>
            ) : !factSheet ? (
              <div className="me-empty-state">
                <p>No fact sheet generated yet.</p>
                <p>It will be created after the next extraction cycle.</p>
              </div>
            ) : (
              <>
                <div className="me-fact-sheet-meta">
                  Generated <TimeAgo date={factSheet.created_at} />
                  {" · "}
                  {factSheet.fact_count} facts
                  {factSheet.dedup_log && factSheet.dedup_log.length > 0 && (
                    <> · {factSheet.dedup_log.length} deduped</>
                  )}
                </div>
                <div className="me-facts-list">
                  {factSheet.facts.map((entry, idx) => (
                    <div key={idx} className="me-fact-item">
                      <span className={`me-fact-badge me-fact-badge-${entry.category}`}>
                        {entry.category}
                      </span>
                      <span className="me-fact-text">{entry.fact}</span>
                      <span className="me-fact-score">{entry.score}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="me-page-footer">
      </div>
    </div>
  );
}
