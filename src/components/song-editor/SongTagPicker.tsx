import { Check } from 'lucide-react';
import type { Tag } from '../../types';

export default function SongTagPicker({
  tags,
  selected,
  onChange,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (tagIds: string[]) => void;
}) {
  return (
    <fieldset className="songs-tags-field">
      <legend>Etiquetas</legend>
      {tags.length ? (
        <div className="chips">
          {tags.map(tag => {
            const isSelected = selected.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className={`chip ${isSelected ? 'active' : ''}`}
                aria-pressed={isSelected}
                onClick={() => onChange(isSelected ? selected.filter(id => id !== tag.id) : [...selected, tag.id])}
              >
                {isSelected && <Check size={13} />}
                <span className="songs-tag-dot" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">Cadastre etiquetas na seção Etiquetas para organizar as músicas.</p>
      )}
    </fieldset>
  );
}
