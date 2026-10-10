import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import { createGroup, updateGroup } from '../../services/groupService';
import { validateGroupForm } from '../../utils/validation';
import { useToast } from '../../hooks/useToast';

/**
 * Create or edit a group. When `group` is provided, member name fields are
 * not shown (members are managed from the group detail page once created).
 */
export default function GroupFormModal({ group, onClose, onSaved }) {
  const isEdit = !!group;
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [members, setMembers] = useState(group ? [] : ['', '']);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function updateMember(i, value) {
    setMembers((prev) => prev.map((m, idx) => (idx === i ? value : m)));
  }

  function addMemberField() {
    setMembers((prev) => [...prev, '']);
  }

  function removeMemberField(i) {
    setMembers((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isEdit) {
      if (!name.trim()) {
        setErrors({ name: 'Group name is required.' });
        return;
      }
      setSaving(true);
      try {
        await updateGroup(group.id, { name, description });
        toast.success('Group updated.');
        onSaved();
      } catch (err) {
        toast.error(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    const { errors: validationErrors, isValid, cleanedMembers } = validateGroupForm({ name, members });
    setErrors(validationErrors);
    if (!isValid) return;

    setSaving(true);
    try {
      await createGroup({ name, description, memberNames: cleanedMembers });
      toast.success('Group created.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit group' : 'New group'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="group-name">Group name</label>
          <input
            id="group-name"
            className={errors.name ? 'invalid' : ''}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Goa Trip 2026"
            autoFocus
          />
          {errors.name && <span className="error">{errors.name}</span>}
        </div>

        <div className="field">
          <label htmlFor="group-description">Description (optional)</label>
          <input
            id="group-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Weekend trip with friends"
          />
        </div>

        {!isEdit && (
          <div className="field">
            <label>Members</label>
            {members.map((m, i) => (
              <div key={i} className="flex-row" style={{ marginBottom: 8 }}>
                <input
                  value={m}
                  onChange={(e) => updateMember(i, e.target.value)}
                  placeholder={`Member ${i + 1} name`}
                  aria-label={`Member ${i + 1} name`}
                />
                {members.length > 2 && (
                  <button type="button" className="icon-btn" aria-label="Remove member" onClick={() => removeMemberField(i)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addMemberField}>
              <Plus size={14} /> Add member
            </button>
            {errors.members && <span className="error">{errors.members}</span>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create group'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
