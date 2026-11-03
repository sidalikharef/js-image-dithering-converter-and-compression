export function createPerformanceTimer(now=()=>performance.now()) {
  const startedAt=now();
  const stages={};
  return {
    start(name){stages[name]={startedAt:now()};},
    end(name){const stage=stages[name];if(!stage||stage.durationMs!==undefined)return null;stage.durationMs=now()-stage.startedAt;return stage.durationMs;},
    snapshot(){return {durationMs:now()-startedAt,stages:Object.fromEntries(
      Object.entries(stages).map(([name,value])=>[name,value.durationMs ?? null]))};}
  };
}
