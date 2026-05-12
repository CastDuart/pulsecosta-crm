import { useState } from 'react';
import { useLang } from '../context/LangContext';
import { MOCK_TASKS } from '../lib/mockData';
import type { Task } from '../types';

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--rojo)',
  high:   'var(--naranja)',
  medium: 'var(--amarillo)',
  low:    'var(--gris)',
};

export default function Tasks() {
  const { t } = useLang();
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');

  const toggle = (id: number) =>
    setTasks(prev => prev.map(tk => tk.id === id ? { ...tk, done: !tk.done } : tk));

  const filtered = tasks
    .filter(tk => filter === 'all' ? true : filter === 'done' ? tk.done : !tk.done)
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    });

  const pending = tasks.filter(t => !t.done).length;

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">
          {t('nav.tasks')}
          {pending > 0 && (
            <span className="nav-badge" style={{ marginLeft: 10, fontSize: '0.65rem' }}>{pending}</span>
          )}
        </span>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => alert('Nueva tarea — pendiente de conectar a API')}>
            + Tarea
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="filter-bar">
          {(['all', 'pending', 'done'] as const).map(f => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendientes' : 'Completadas'}
            </button>
          ))}
          <select className="filter-select">
            <option>{t('filter.allAgents')}</option>
            <option>Cipry</option>
            <option>Heidi</option>
          </select>
          <select className="filter-select">
            <option>{t('filter.allStatuses')}</option>
            {['urgent', 'high', 'medium', 'low'].map(p => (
              <option key={p}>{t(`priority.${p}`)}</option>
            ))}
          </select>
        </div>

        <div className="card">
          {filtered.map(task => (
            <div className="task-item" key={task.id}>
              <div
                className={`task-check${task.done ? ' done' : ''}`}
                onClick={() => toggle(task.id)}
              >
                {task.done && '✓'}
              </div>
              <div className="task-priority" style={{ background: PRIORITY_COLOR[task.priority] }} />
              <div className="task-body" style={{ opacity: task.done ? 0.5 : 1 }}>
                <div className="task-title" style={{ textDecoration: task.done ? 'line-through' : 'none' }}>
                  {task.title}
                </div>
                <div className="task-meta">
                  {task.due_at.replace('T', ' ')}
                  {task.account_name && ` · ${task.account_name}`}
                  {` · ${task.assigned_to}`}
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span className={`badge ${task.priority === 'urgent' ? 'badge-red' : task.priority === 'high' ? 'badge-orange' : 'badge-gray'}`}>
                  {t(`priority.${task.priority}`)}
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={{ color: 'var(--gris)', fontSize: '0.82rem', textAlign: 'center', padding: '24px 0' }}>
              No hay tareas en esta categoría.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
