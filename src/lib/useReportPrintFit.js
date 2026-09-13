'use client';
import { useEffect } from 'react';
export function useReportPrintFit(){
  useEffect(()=>{
    const fit=()=>{
      const report=document.querySelector('.report-sheet');if(!report)return;
      document.documentElement.style.setProperty('--report-print-scale','1');
      const ruler=document.createElement('div');ruler.style.cssText='height:283mm;width:196mm;position:absolute;visibility:hidden;pointer-events:none';document.body.appendChild(ruler);
      const available=ruler.getBoundingClientRect(),actual=report.getBoundingClientRect();
      const scale=Math.min(1,available.height/Math.max(actual.height,1),available.width/Math.max(actual.width,1));
      ruler.remove();document.documentElement.style.setProperty('--report-print-scale',String(scale));
    };
    const reset=()=>document.documentElement.style.removeProperty('--report-print-scale');
    window.addEventListener('beforeprint',fit);window.addEventListener('afterprint',reset);
    return()=>{window.removeEventListener('beforeprint',fit);window.removeEventListener('afterprint',reset);reset()};
  },[]);
}
