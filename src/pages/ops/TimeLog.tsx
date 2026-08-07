import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/opsFetch';
import type { Jornada } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Play, Square, MapPin, Download } from 'lucide-react';
import ExcelJS from 'exceljs';

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2,'0')}m`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'2-digit' });
}

export default function TimeLog() {
  const { user } = useAuth();
  const [jornadas, setJornadas]     = useState<Jornada[]>([]);
  const [open, setOpen]             = useState<Jornada | null>(null);
  const [loading, setLoading]       = useState(true);
  const [clocking, setClocking]     = useState(false);
  const [location, setLocation]     = useState<GeolocationPosition | null>(null);
  const [locError, setLocError]     = useState('');

  const isAdmin = user?.role === 'super_admin';

  const load = async () => {
    const j = await apiFetch<Jornada[]>('/ops/jornadas');
    setJornadas(j);
    const today = new Date().toISOString().split('T')[0];
    const todayOpen = j.find(x => x.user_id === user?.id && x.fecha === today && !x.salida);
    setOpen(todayOpen || null);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Try to get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation(pos),
        () => setLocError('Location unavailable — will clock without GPS'),
      );
    }
  }, []);

  async function clockIn() {
    setClocking(true);
    try {
      const body: Record<string, unknown> = {};
      if (location) {
        body.lat = location.coords.latitude;
        body.lng = location.coords.longitude;
      }
      await apiFetch('/ops/jornadas/entrada', { method:'POST', body:JSON.stringify(body) });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setClocking(false);
    }
  }

  async function clockOut() {
    if (!open) return;
    setClocking(true);
    try {
      const body: Record<string, unknown> = {};
      if (location) {
        body.lat = location.coords.latitude;
        body.lng = location.coords.longitude;
      }
      await apiFetch(`/ops/jornadas/${open.id}/salida`, { method:'PUT', body:JSON.stringify(body) });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setClocking(false);
    }
  }

  async function exportExcel() {
    const rows = jornadas.map(j => ({
      'Date':        j.fecha,
      'Worker':      j.user_name || '',
      'Clock in':    formatTime(j.entrada),
      'Clock out':   j.salida ? formatTime(j.salida) : '',
      'Hours':       j.total_minutos ? formatMinutes(j.total_minutos) : '',
      'Location in': j.direccion_entrada || (j.lat_entrada ? `${j.lat_entrada.toFixed(4)}, ${j.lng_entrada?.toFixed(4)}` : ''),
    }));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Time Log');
    if (rows.length > 0) {
      ws.columns = Object.keys(rows[0]).map(key => ({ header: key, key, width: 22 }));
      ws.getRow(1).font = { bold: true };
      rows.forEach(r => ws.addRow(r));
    }
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = `TimeLog_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Total hours this month
  const now = new Date();
  const monthJornadas = jornadas.filter(j => {
    const d = new Date(j.fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      && j.user_id === user?.id;
  });
  const totalMinutes = monthJornadas.reduce((s, j) => s + (j.total_minutos || 0), 0);

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
        <h1 style={{ fontFamily:'Syne, sans-serif',fontSize:26,fontWeight:800,color:'var(--ink)',margin:0 }}>Time Log</h1>
        <button onClick={exportExcel} style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:'var(--ivory-alt)',border:'none',borderRadius:8,color:'var(--ink)',cursor:'pointer',fontSize:13 }}>
          <Download size={14}/> Export
        </button>
      </div>

      {/* Clock in/out panel */}
      <div style={{ background:'var(--ivory-alt)',borderRadius:16,padding:'28px 32px',border:'1px solid var(--linea)',marginBottom:28,display:'flex',alignItems:'center',gap:32 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13,color:'var(--muted)',marginBottom:6 }}>Today — {new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</div>
          {open ? (
            <div>
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4 }}>
                <div style={{ width:8,height:8,borderRadius:'50%',background:'var(--state-quiet)',animation:'pulse 2s infinite' }}/>
                <span style={{ fontWeight:700,color:'var(--verde-text)',fontSize:16 }}>Active shift since {formatTime(open.entrada)}</span>
              </div>
              {open.lat_entrada && (
                <div style={{ fontSize:12,color:'var(--muted)',display:'flex',alignItems:'center',gap:4 }}>
                  <MapPin size={12}/> {open.lat_entrada.toFixed(4)}, {open.lng_entrada?.toFixed(4)}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color:'var(--muted)',fontSize:14 }}>No active shift</div>
          )}
          {locError && <div style={{ marginTop:6,fontSize:11,color:'var(--naranja-text)' }}>{locError}</div>}
        </div>

        <div>
          {!open ? (
            <button onClick={clockIn} disabled={clocking} style={{
              display:'flex',alignItems:'center',gap:10,padding:'14px 28px',
              borderRadius:12,border:'none',background:'rgba(23,129,127,0.15)',
              color:'var(--verde-text)',fontWeight:800,fontSize:16,cursor:'pointer',
            }}>
              <Play size={20} fill="var(--verde-text)"/> {clocking ? 'Clocking in...' : 'Clock In'}
            </button>
          ) : (
            <button onClick={clockOut} disabled={clocking} style={{
              display:'flex',alignItems:'center',gap:10,padding:'14px 28px',
              borderRadius:12,border:'none',background:'rgba(229,72,77,0.15)',
              color:'var(--rojo-text)',fontWeight:800,fontSize:16,cursor:'pointer',
            }}>
              <Square size={20} fill="var(--rojo-text)"/> {clocking ? 'Clocking out...' : 'Clock Out'}
            </button>
          )}
        </div>

        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>This month</div>
          <div style={{ fontFamily:'JetBrains Mono, monospace',fontSize:22,fontWeight:700,color:'var(--teal-tint)' }}>
            {formatMinutes(totalMinutes)}
          </div>
          <div style={{ fontSize:11,color:'var(--muted)' }}>{monthJornadas.length} shifts</div>
        </div>
      </div>

      {/* History table */}
      <div style={{ background:'var(--ivory-alt)',borderRadius:12,border:'1px solid var(--linea)',overflow:'hidden' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--linea)' }}>
              {['Date', ...(isAdmin ? ['Worker'] : []), 'Clock In', 'Clock Out', 'Duration', 'Location'].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'12px 16px',color:'var(--muted)',fontWeight:500,fontSize:12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jornadas.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:'24px',color:'var(--muted)',textAlign:'center' }}>No records yet</td></tr>
            ) : jornadas.map(j => (
              <tr key={j.id} style={{ borderBottom:'1px solid var(--linea-alta)' }}>
                <td style={{ padding:'10px 16px',color:'var(--ink)' }}>{formatDate(j.fecha)}</td>
                {isAdmin && <td style={{ padding:'10px 16px',color:'var(--muted)' }}>{j.user_name}</td>}
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',color:'var(--verde-text)' }}>{formatTime(j.entrada)}</td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',color:j.salida?'var(--rojo-text)':'var(--naranja-text)' }}>
                  {j.salida ? formatTime(j.salida) : <span style={{ color:'var(--naranja-text)' }}>Active</span>}
                </td>
                <td style={{ padding:'10px 16px',fontFamily:'JetBrains Mono, monospace',color:'var(--teal-tint)' }}>
                  {j.total_minutos ? formatMinutes(j.total_minutos) : '-'}
                </td>
                <td style={{ padding:'10px 16px',fontSize:11,color:'var(--muted)' }}>
                  {j.lat_entrada ? (
                    <span style={{ display:'flex',alignItems:'center',gap:4 }}>
                      <MapPin size={11}/> {j.lat_entrada.toFixed(4)}, {j.lng_entrada?.toFixed(4)}
                    </span>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
