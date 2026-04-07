'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Trash2, Plus, Layout, GripVertical } from 'lucide-react'
import { 
  DndContext, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent 
} from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core';

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="flex flex-col gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800 min-h-[500px]">
      {children}
    </div>
  );
}
// --- Sub-Component for Sortable Tasks ---
function SortableTask({ task, onDelete }: { task: any, onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      className="group relative bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-sm hover:border-blue-500/40 hover:bg-slate-750 transition-colors duration-200"
    >
      <div className="flex items-start gap-3">
        <button {...listeners} className="mt-1 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400">
          <GripVertical className="w-4 h-4" />
        </button>
        <p className="text-sm text-slate-300 leading-relaxed font-medium flex-1">
          {task.content}
        </p>
      </div>
      <div className="flex items-center justify-between mt-4 ml-7">
        <span className="text-[10px] text-slate-500 font-mono">#{task.id.slice(0,4)}</span>
        <button 
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-400 rounded-md transition-all text-slate-500"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// --- Main Board Component ---
export default function KanbanBoard() {
  const supabase = createClient()
  const [columns, setColumns] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))

  const refreshData = async () => {
    const { data: cols } = await supabase.from('columns').select('*').order('order_index')
    const { data: tsks } = await supabase.from('tasks').select('*').order('position_index')
    if (cols) setColumns(cols)
    if (tsks) setTasks(tsks || [])
    setLoading(false)
  }
  const handleAddTask = async (columnId: string) => {
    const content = prompt("What needs to be done?")
    if (!content) return

    const { error } = await supabase.from('tasks').insert([
      { 
        content, 
        column_id: columnId, 
        position_index: tasks.length + 1 
      }
    ])

    if (error) {
      alert(error.message)
    } else {
      refreshData() 
    }
  }

  useEffect(() => {
    refreshData();
    // ... realtime subscription code ...
  }, []);

  useEffect(() => {
  refreshData();

  // SUBSCRIBE to changes in the 'tasks' table
  const channel = supabase
    .channel('schema-db-changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen for INSERT, UPDATE, and DELETE
        schema: 'public',
        table: 'tasks',
      },
      () => {
        console.log('Change detected! Refreshing...');
        refreshData(); // Re-fetch the data whenever a change happens
      }
    )
    .subscribe();

  // Cleanup: Stop listening when the user leaves the page
  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  // Handle the drop logic
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // Find if we dropped over a task or a column
    const overTask = tasks.find(t => t.id === overId)
    const overColumn = columns.find(c => c.id === overId)
    
    let newColumnId = ""
    if (overTask) newColumnId = overTask.column_id
    if (overColumn) newColumnId = overColumn.id

    if (newColumnId && newColumnId !== tasks.find(t => t.id === taskId)?.column_id) {
      // 1. Update UI Instantly
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column_id: newColumnId } : t))
      
      // 2. Sync to Supabase
      await supabase.from('tasks').update({ column_id: newColumnId }).eq('id', taskId)
    }
  }

  if (loading) return <div className="h-screen bg-[#0f172a] flex items-center justify-center text-blue-500">Loading Engine...</div>

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <main className="min-h-screen bg-[#0f172a] p-12 text-slate-200">
        <header className="max-w-6xl mx-auto mb-12">
          <h1 className="text-4xl font-black tracking-tighter text-white">Interactive Pipeline</h1>
        </header>

        <div className="max-w-7xl mx-auto flex gap-8">
          {columns.map((col) => (
            <div key={col.id} className="w-[320px] shrink-0">
              <h2 className="font-bold text-sm uppercase tracking-widest text-slate-400 mb-4 px-2 italic">
                {col.title}
              </h2>

              <SortableContext 
  id={col.id} 
  items={tasks.filter(t => t.column_id === col.id).map(t => t.id)} 
  strategy={verticalListSortingStrategy}
>
  {/* NEW: Use the Droppable wrapper here */}
  <DroppableColumn id={col.id}>
    {tasks
      .filter((t) => t.column_id === col.id)
      .map((task) => (
        <SortableTask 
          key={task.id} 
          task={task} 
          onDelete={async (id) => {
            await supabase.from('tasks').delete().eq('id', id)
            refreshData()
          }} 
        />
      ))}
    
    <button 
      onClick={() => handleAddTask(col.id)} // Reuse your handleAddTask function
      className="mt-2 py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-blue-400 transition-all text-xs font-bold"
    >
      + ADD TO {col.title}
    </button>
  </DroppableColumn>
</SortableContext>  
            </div>
          ))}
        </div>
      </main>
    </DndContext>
  )
  // Inside your KanbanBoard function...
}