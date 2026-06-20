'use client';

import { ComposedOperation } from './index';
import { OP_COLORS, OP_ICONS } from './operation-palette';
import { GripVertical, Trash2 } from 'lucide-react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';

interface OperationListProps {
  operations: ComposedOperation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (ops: ComposedOperation[]) => void;
}

export function OperationList({
  operations,
  selectedId,
  onSelect,
  onRemove,
  onReorder,
}: OperationListProps) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(operations);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onReorder(reordered);
  };

  if (operations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-border/60 text-center px-4">
        <p className="text-xs text-muted-foreground">
          Click an operation type on the left to add it here
        </p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="operation-list">
        {(provided) => (
          <ol
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col gap-2"
          >
            {operations.map((op, index) => {
              const Icon = OP_ICONS[op.type] ?? (() => null);
              const color = OP_COLORS[op.type] ?? '';
              const isSelected = op.id === selectedId;

              return (
                <Draggable key={op.id} draggableId={op.id} index={index}>
                  {(drag, snapshot) => (
                    <li
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-all select-none
                        ${snapshot.isDragging ? 'shadow-2xl shadow-black/40 rotate-1 scale-[1.02]' : ''}
                        ${isSelected
                          ? `bg-gradient-to-br ${color} ring-1 ring-inset ring-white/10`
                          : 'bg-card border-border hover:border-border/80 hover:bg-card/80'
                        }`}
                      onClick={() => onSelect(op.id)}
                      id={`op-item-${op.id}`}
                    >
                      <span
                        {...drag.dragHandleProps}
                        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>

                      <span className="flex items-center justify-center h-5 w-5 shrink-0 rounded text-[10px] font-bold bg-black/30 text-muted-foreground">
                        {index + 1}
                      </span>

                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate capitalize">
                          {op.type.replace(/_/g, ' ')}
                        </p>
                        {typeof op.fields.destination === 'string' && op.fields.destination && (
                          <p className="text-[10px] font-mono text-muted-foreground truncate">
                            {op.fields.destination.slice(0, 20)}…
                          </p>
                        )}
                      </div>

                      <button
                        id={`remove-op-${op.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(op.id);
                        }}
                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-destructive/70 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </ol>
        )}
      </Droppable>
    </DragDropContext>
  );
}
