import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { SoulTemplate } from '../lib/types';
import { fetchSouls, createSoul, updateSoul, deleteSoul } from '../lib/api';

export function SoulsPage() {
  const [souls, setSouls] = useState<SoulTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSoul, setExpandedSoul] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    loadSouls();
  }, []);

  const loadSouls = async () => {
    setLoading(true);
    try {
      const data = await fetchSouls();
      setSouls(data);
    } catch (error) {
      console.error('Failed to load souls:', error);
      toast.error('Failed to load soul templates');
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async (soul: SoulTemplate) => {
    if (expandedSoul === soul.name) {
      setExpandedSoul(null);
      setEditContent('');
    } else {
      setExpandedSoul(soul.name);
      // Load content from disk
      try {
        const response = await fetch(`/api/souls/${encodeURIComponent(soul.name)}`);
        if (!response.ok) throw new Error('Failed to fetch soul content');
        const data = await response.json();
        setEditContent(data.content || `# ${soul.name}\n\n`);
      } catch (error) {
        console.error('Failed to load soul content:', error);
        setEditContent(`# ${soul.name}\n\n`);
      }
    }
  };

  const handleSave = async (name: string) => {
    setSaving(true);
    try {
      await updateSoul(name, editContent);
      toast.success('Soul updated');
      await loadSouls();
      setExpandedSoul(null);
      setEditContent('');
    } catch (error) {
      console.error('Failed to update soul:', error);
      toast.error('Failed to update soul');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) {
      toast.error('Name and content are required');
      return;
    }

    setCreating(true);
    try {
      await createSoul(newName.trim(), newContent);
      toast.success(`Soul "${newName}" created`);
      setShowNewForm(false);
      setNewName('');
      setNewContent('');
      await loadSouls();
    } catch (error) {
      console.error('Failed to create soul:', error);
      toast.error('Failed to create soul');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteSoul(deleteTarget);
      toast.success(`Soul "${deleteTarget}" deleted`);
      await loadSouls();
      if (expandedSoul === deleteTarget) {
        setExpandedSoul(null);
        setEditContent('');
      }
    } catch (error) {
      console.error('Failed to delete soul:', error);
      toast.error('Failed to delete soul');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Soul Templates
        </h1>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="
            px-4 py-2 text-sm font-medium
            bg-accent-cyan/20 border border-accent-cyan
            text-accent-cyan
            hover:bg-accent-cyan/30
            transition-colors
          "
        >
          {showNewForm ? 'Cancel' : '+ New Soul'}
        </button>
      </div>

      {/* New Soul Form */}
      {showNewForm && (
        <div className="panel space-y-4">
          <h2 className="text-lg font-medium text-text-primary">Create New Soul</h2>
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              Name (alphanumeric + hyphens)
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., helpful-assistant"
              className="
                w-full px-3 py-2
                bg-bg-surface border border-border
                text-text-primary
                focus:border-accent-cyan focus:outline-none
                transition-colors
              "
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              Content
            </label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="# Soul Name&#10;&#10;Your soul template content..."
              rows={8}
              className="
                w-full px-3 py-2
                bg-bg-surface border border-border
                text-text-primary font-mono text-sm
                focus:border-accent-cyan focus:outline-none
                transition-colors resize-y
              "
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="
                px-4 py-2 text-sm font-medium
                bg-accent-cyan/20 border border-accent-cyan
                text-accent-cyan
                hover:bg-accent-cyan/30
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowNewForm(false);
                setNewName('');
                setNewContent('');
              }}
              className="
                px-4 py-2 text-sm
                bg-bg-surface border border-border
                text-text-secondary
                hover:text-text-primary hover:border-border-hover
                transition-colors
              "
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Souls List */}
      {loading ? (
        <div className="panel text-center py-12">
          <p className="text-text-muted">Loading soul templates...</p>
        </div>
      ) : souls.length === 0 ? (
        <div className="panel text-center py-12">
          <p className="text-text-muted">No soul templates yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {souls.map((soul) => (
            <div key={soul.name} className="panel">
              {/* Soul Header */}
              <button
                onClick={() => handleExpand(soul)}
                className="
                  w-full text-left
                  flex items-center justify-between
                  hover:text-accent-cyan
                  transition-colors
                "
              >
                <div>
                  <h3 className="mono-data font-semibold text-base text-text-primary">
                    {soul.name}
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    {soul.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {expandedSoul === soul.name ? (
                    <span className="text-sm text-text-muted">▼</span>
                  ) : (
                    <span className="text-sm text-text-muted">▶</span>
                  )}
                </div>
              </button>

              {/* Expanded Editor */}
              {expandedSoul === soul.name && (
                <div className="mt-4 pt-4 border-t border-border space-y-4">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={12}
                    className="
                      w-full px-3 py-2
                      bg-bg-elevated border border-border
                      text-text-primary font-mono text-sm
                      focus:border-accent-cyan focus:outline-none
                      transition-colors resize-y
                    "
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(soul.name)}
                      disabled={saving}
                      className="
                        px-4 py-2 text-sm font-medium
                        bg-accent-cyan/20 border border-accent-cyan
                        text-accent-cyan
                        hover:bg-accent-cyan/30
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors
                      "
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setExpandedSoul(null);
                        setEditContent('');
                      }}
                      className="
                        px-4 py-2 text-sm
                        bg-bg-surface border border-border
                        text-text-secondary
                        hover:text-text-primary hover:border-border-hover
                        transition-colors
                      "
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setDeleteTarget(soul.name)}
                      className="
                        ml-auto px-4 py-2 text-sm
                        bg-status-offline/20 border border-status-offline
                        text-status-offline
                        hover:bg-status-offline/30
                        transition-colors
                      "
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Soul Template"
        description={`Are you sure you want to delete "${deleteTarget}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
