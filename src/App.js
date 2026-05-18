import { useState, useEffect } from "react";
import { ref, onValue, push, remove } from "firebase/database";
import { db } from "./firebase";
import { Plus, Trash2, ChevronDown, X, Save } from "lucide-react";

const C = {
  bg: "#0a0e1a", surface: "#111827", card: "#1a2235", border: "#1e2d45",
  accent: "#00d4ff", gold: "#ffd700", green: "#00e676", red: "#ff5252",
  orange: "#ff9800", text: "#e8f0fe", muted: "#6b7fa3",
};

const RESULT_MAP = { 승:1, 승리:1, win:1, WIN:1, 무:0, 무승부:0, draw:0, DRAW:0, 패:-1, 패배:-1, lose:-1, LOSE:-1 };
const parseResult = (v) => { if(v===""||v==null) return null; const n=Number(v); if(!isNaN(n)) return n; return RESULT_MAP[String(v).trim()]??null; };
const EMPTY_GAME = () => ({ date:new Date().toISOString().split("T")[0], type:"매치", player:"", goal:0, assist:0, save:0, matchMvp:0, result:"", note:"" });

function calcStats(games, attendances, playerName) {
  const rows = Object.values(games||{}).filter(g=>g.player===playerName);
  let goal=0,assist=0,save=0,matchMvp=0,matchTotal=0,selfResult=0,matchCount=0,selfCount=0;
  rows.forEach(g => {
    if(g.type==="매치") { goal+=Number(g.goal)||0; assist+=Number(g.assist)||0; save+=Number(g.save)||0; matchMvp+=Number(g.matchMvp)||0; matchTotal+=(Number(g.goal)||0)+(Number(g.assist)||0)+(Number(g.save)||0)+(Number(g.matchMvp)||0); matchCount++; }
    else { const r=parseResult(g.result); if(r!==null){selfResult+=r;selfCount++;} }
  });
  const attendancePoint = Object.values(attendances||{}).filter(a=>a.playerName===playerName).length;
  const mvpTotal = matchTotal+selfResult;
  return { goal, assist, save, matchMvp, matchTotal, selfResult, mvpTotal, attendancePoint, total:mvpTotal+attendancePoint, matchCount, selfCount, gameCount:rows.length };
}

const inp = { background:"#111827", border:"1px solid #1e2d45", borderRadius:8, color:"#e8f0fe", padding:"8px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
const lbl = { color:"#6b7fa3", fontSize:11, letterSpacing:1, marginBottom:4, display:"block" };

function StatPill({ label, value, color=C.accent }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",minWidth:64 }}>
      <span style={{ color:C.muted,fontSize:10,letterSpacing:1 }}>{label}</span>
      <span style={{ color,fontSize:20,fontWeight:800 }}>{value}</span>
    </div>
  );
}

export default function App() {
  const [players, setPlayers] = useState({});
  const [games, setGames] = useState({});
  const [attendances, setAttendances] = useState({});
  const [tab, setTab] = useState("ranking");
  const [addingGame, setAddingGame] = useState(false);
  const [newGame, setNewGame] = useState(EMPTY_GAME());
  const [newPlayerName, setNewPlayerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [filterType, setFilterType] = useState("전체");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const u1 = onValue(ref(db,"players"), s=>{setPlayers(s.val()||{});setLoading(false);});
    const u2 = onValue(ref(db,"games"), s=>setGames(s.val()||{}));
    const u3 = onValue(ref(db,"attendances"), s=>setAttendances(s.val()||{}));
    return ()=>{u1();u2();u3();};
  }, []);

  const addPlayer = async () => {
    const name=newPlayerName.trim();
    if(!name||Object.values(players).find(p=>p.name===name)) return;
    setSyncing(true); await push(ref(db,"players"),{name}); setNewPlayerName(""); setSyncing(false);
  };

  const removePlayer = async (id) => {
    const name=players[id]?.name;
    await remove(ref(db,`players/${id}`));
    for(const [gid] of Object.entries(games).filter(([,g])=>g.player===name)) await remove(ref(db,`games/${gid}`));
    for(const [aid] of Object.entries(attendances).filter(([,a])=>a.playerName===name)) await remove(ref(db,`attendances/${aid}`));
  };

  // 경기 저장 시 출석 자동 추가 (같은 날 처음 경기면 +1점)
  const saveGame = async () => {
    if(!newGame.player) return;
    setSyncing(true);
    await push(ref(db,"games"),{...newGame,createdAt:Date.now()});
    const already = Object.values(attendances).find(a=>a.playerName===newGame.player&&a.date===newGame.date);
    if(!already) await push(ref(db,"attendances"),{playerName:newGame.player,date:newGame.date,createdAt:Date.now(),auto:true});
    setAddingGame(false); setNewGame(EMPTY_GAME()); setSyncing(false);
  };

  // 경기 삭제 시 해당 날짜 다른 경기 없으면 출석도 같이 삭제
  const removeGame = async (id) => {
    const g = games[id];
    await remove(ref(db,`games/${id}`));
    // 삭제 후 같은 선수+날짜 경기가 남아있는지 확인
    const remaining = Object.entries(games).filter(([gid,og])=>gid!==id&&og.player===g.player&&og.date===g.date);
    if(remaining.length===0) {
      const attendEntry = Object.entries(attendances).find(([,a])=>a.playerName===g.player&&a.date===g.date);
      if(attendEntry) await remove(ref(db,`attendances/${attendEntry[0]}`));
    }
  };

  const ranking = Object.entries(players).map(([id,p])=>({id,...p,...calcStats(games,attendances,p.name)})).sort((a,b)=>b.total-a.total);
  const filteredGames = Object.entries(games).filter(([,g])=>filterType==="전체"||g.type===filterType).sort(([,a],[,b])=>(b.createdAt||0)-(a.createdAt||0));

  if(loading) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}><div style={{fontSize:36}}>⚽</div><div style={{color:C.accent,fontSize:14,fontFamily:"monospace",letterSpacing:2}}>LOADING...</div></div>;

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Noto Sans KR',sans-serif", color:C.text }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0d1b2e,#0a0e1a)", borderBottom:`1px solid ${C.border}`, padding:"0 20px", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:900, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:58 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:22 }}>⚽</span>
            <div>
              <div style={{ fontWeight:800, fontSize:16 }}>풋살 동호회</div>
              <div style={{ fontSize:10, color:C.accent, letterSpacing:2, fontWeight:600 }}>MVP DASHBOARD</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {syncing && <span style={{ fontSize:11, color:C.green }}>↑ 저장 중...</span>}
            <span style={{ fontSize:11, color:C.muted }}>{Object.keys(players).length}명 · {Object.keys(games).length}경기</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:900, margin:"0 auto", display:"flex", padding:"0 20px" }}>
          {[{id:"ranking",label:"🏆 순위"},{id:"games",label:"📋 경기 기록"},{id:"players",label:"👥 선수 관리"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:"none",border:"none",cursor:"pointer",padding:"14px 14px",fontSize:13,fontWeight:tab===t.id?700:400,color:tab===t.id?C.accent:C.muted,borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",transition:"all 0.2s",fontFamily:"inherit",whiteSpace:"nowrap" }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>

        {/* 순위 탭 */}
        {tab==="ranking" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 16px", marginBottom:4 }}>
              <span style={{ fontSize:11, color:C.muted }}>📋 MVP 점수  +  📅 출석 점수 합산 순위  ·  경기 입력 시 출석 자동 반영</span>
            </div>
            {ranking.length===0
              ? <div style={{ textAlign:"center",color:C.muted,padding:60 }}><div style={{ fontSize:48,marginBottom:12 }}>🏆</div><div>선수를 먼저 등록해주세요</div></div>
              : ranking.map((p,i)=>{
                const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`;
                const hl=i===0?C.gold:i===1?"#c0c0c0":i===2?"#cd7f32":C.accent;
                const isExp=expandedPlayer===p.id;
                return (
                  <div key={p.id} onClick={()=>setExpandedPlayer(isExp?null:p.id)} style={{ background:C.card,border:`1px solid ${i<3?hl+"44":C.border}`,borderRadius:14,padding:"16px 20px",cursor:"pointer",boxShadow:i===0?`0 0 20px rgba(255,215,0,0.15)`:"none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                      <span style={{ fontSize:i<3?26:14, minWidth:30, textAlign:"center", color:C.muted, fontWeight:700 }}>{medal}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:16 }}>{p.name}</div>
                        <div style={{ color:C.muted, fontSize:12, marginTop:2 }}>매치 {p.matchCount}경기 · 자체전 {p.selfCount}경기 · 출석 {p.attendancePoint}점</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:28, fontWeight:900, color:hl, lineHeight:1 }}>{p.total}</div>
                        <div style={{ fontSize:10, color:C.muted, letterSpacing:1 }}>총점</div>
                      </div>
                      <ChevronDown size={16} color={C.muted} style={{ transform:isExp?"rotate(180deg)":"none", transition:"0.2s" }} />
                    </div>
                    {isExp && (
                      <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${C.border}` }}>
                        <div style={{ fontSize:11,color:C.muted,marginBottom:8,letterSpacing:1 }}>MVP 점수</div>
                        <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:12 }}>
                          <StatPill label="⚽ 골득점" value={p.goal} />
                          <StatPill label="🎯 골어시" value={p.assist} />
                          <StatPill label="🧤 선방" value={p.save} />
                          <StatPill label="⭐ MVP" value={p.matchMvp} color={C.gold} />
                          <StatPill label="🏟️ 자체전" value={p.selfResult>=0?`+${p.selfResult}`:p.selfResult} color={p.selfResult>=0?C.green:C.red} />
                          <StatPill label="MVP합계" value={p.mvpTotal} />
                        </div>
                        <div style={{ fontSize:11,color:C.muted,marginBottom:8,letterSpacing:1 }}>출석 점수</div>
                        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                          <StatPill label="📅 출석횟수" value={p.attendancePoint} color={C.orange} />
                          <StatPill label="출석점수" value={`+${p.attendancePoint}`} color={C.orange} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* 경기 기록 탭 */}
        {tab==="games" && (
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <div style={{ display:"flex",gap:6 }}>
                {["전체","매치","자체전"].map(f=>(
                  <button key={f} onClick={()=>setFilterType(f)} style={{ background:filterType===f?C.accent:C.card,color:filterType===f?C.bg:C.muted,border:`1px solid ${filterType===f?C.accent:C.border}`,borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>{f}</button>
                ))}
              </div>
              <button onClick={()=>{setAddingGame(true);setNewGame(EMPTY_GAME());}} style={{ background:C.accent,color:C.bg,border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"inherit" }}><Plus size={14}/> 경기 추가</button>
            </div>

            {addingGame && (
              <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:20,marginBottom:16 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
                  <span style={{ fontWeight:700,fontSize:15 }}>새 경기 기록</span>
                  <button onClick={()=>setAddingGame(false)} style={{ background:"none",border:"none",cursor:"pointer",color:C.muted }}><X size={18}/></button>
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12 }}>
                  <div><label style={lbl}>선수</label>
                    <select value={newGame.player} onChange={e=>setNewGame(g=>({...g,player:e.target.value}))} style={inp}>
                      <option value="">선택</option>
                      {Object.values(players).map(p=><option key={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>날짜</label><input type="date" value={newGame.date} onChange={e=>setNewGame(g=>({...g,date:e.target.value}))} style={inp}/></div>
                  <div><label style={lbl}>경기 유형</label>
                    <select value={newGame.type} onChange={e=>setNewGame(g=>({...g,type:e.target.value}))} style={inp}>
                      <option>매치</option><option>자체전</option>
                    </select>
                  </div>
                </div>
                {newGame.type==="매치" ? (
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:12 }}>
                    {[["goal","⚽ 골득점"],["assist","🎯 골어시"],["save","🧤 선방"],["matchMvp","⭐ MVP"]].map(([k,l])=>(
                      <div key={k}><label style={lbl}>{l}</label><input type="number" min="0" value={newGame[k]} onChange={e=>setNewGame(g=>({...g,[k]:e.target.value}))} style={inp} placeholder="0"/></div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
                    <div><label style={lbl}>🏟️ 결과</label>
                      <select value={newGame.result} onChange={e=>setNewGame(g=>({...g,result:e.target.value}))} style={inp}>
                        <option value="">선택</option><option value="승">승 (+1점)</option><option value="무">무 (0점)</option><option value="패">패 (-1점)</option>
                      </select>
                    </div>
                    <div style={{ display:"flex",alignItems:"flex-end" }}>
                      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px",fontSize:20,fontWeight:800,width:"100%",textAlign:"center",color:newGame.result==="승"?C.green:newGame.result==="패"?C.red:C.muted }}>
                        {newGame.result==="승"?"+1":newGame.result==="패"?"-1":newGame.result==="무"?"0":"–"}
                      </div>
                    </div>
                  </div>
                )}
                {/* 출석 자동 안내 */}
                <div style={{ background:"rgba(255,152,0,0.08)",border:`1px solid ${C.orange}33`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:C.orange }}>
                  📅 경기 저장 시 해당 날짜 출석 +1점 자동 반영 (같은 날 중복 없음)
                </div>
                <div style={{ marginBottom:12 }}><label style={lbl}>비고</label><input value={newGame.note} onChange={e=>setNewGame(g=>({...g,note:e.target.value}))} style={inp} placeholder="메모 (선택)"/></div>
                <button onClick={saveGame} style={{ background:C.accent,color:C.bg,border:"none",borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"inherit" }}><Save size={14}/> 저장</button>
              </div>
            )}

            {filteredGames.length===0
              ? <div style={{ textAlign:"center",color:C.muted,padding:60 }}>경기 기록이 없습니다</div>
              : filteredGames.map(([id,g])=>{
                const r=parseResult(g.result);
                const score=g.type==="매치"?(Number(g.goal)||0)+(Number(g.assist)||0)+(Number(g.save)||0)+(Number(g.matchMvp)||0):(r!==null?r:0);
                const sc=g.type==="매치"?C.accent:score>0?C.green:score<0?C.red:C.muted;
                return (
                  <div key={id} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:8 }}>
                    <div style={{ background:g.type==="매치"?"rgba(0,212,255,0.1)":"rgba(0,230,118,0.1)",border:`1px solid ${g.type==="매치"?C.accent+"44":C.green+"44"}`,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,color:g.type==="매치"?C.accent:C.green,whiteSpace:"nowrap" }}>{g.type}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600,fontSize:14 }}>{g.player}</div>
                      <div style={{ color:C.muted,fontSize:11,marginTop:2 }}>{g.date}{g.type==="매치"&&` · 골${g.goal||0} 어시${g.assist||0} 선방${g.save||0} MVP${g.matchMvp||0}`}{g.type==="자체전"&&` · ${g.result||"–"}`}{g.note&&` · ${g.note}`}</div>
                    </div>
                    <div style={{ fontSize:20,fontWeight:800,color:sc,minWidth:36,textAlign:"right" }}>{g.type==="자체전"&&score>=0?`+${score}`:score}</div>
                    <button onClick={()=>removeGame(id)} style={{ background:"none",border:"none",cursor:"pointer",color:C.muted,padding:4 }}><Trash2 size={14}/></button>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* 선수 관리 탭 */}
        {tab==="players" && (
          <div>
            <div style={{ display:"flex",gap:8,marginBottom:20 }}>
              <input value={newPlayerName} onChange={e=>setNewPlayerName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPlayer()} placeholder="선수 이름 입력" style={{ ...inp,flex:1 }}/>
              <button onClick={addPlayer} style={{ background:C.accent,color:C.bg,border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>추가</button>
            </div>
            {Object.keys(players).length===0
              ? <div style={{ textAlign:"center",color:C.muted,padding:60 }}><div style={{ fontSize:40,marginBottom:12 }}>👥</div><div>선수를 등록해주세요</div></div>
              : (
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                  {Object.entries(players).map(([id,p])=>{
                    const s=calcStats(games,attendances,p.name);
                    return (
                      <div key={id} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:12 }}>
                        <div style={{ width:40,height:40,borderRadius:"50%",background:"rgba(0,212,255,0.1)",border:`1px solid ${C.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:C.accent }}>{p.name[0]}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700,fontSize:14 }}>{p.name}</div>
                          <div style={{ color:C.muted,fontSize:11 }}>MVP {s.mvpTotal}점 · 출석 {s.attendancePoint}점 · 합계 {s.total}점</div>
                        </div>
                        <button onClick={()=>removePlayer(id)} style={{ background:"none",border:"none",cursor:"pointer",color:C.muted }}><Trash2 size={14}/></button>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}
