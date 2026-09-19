'use client';
import { useEffect, useRef } from 'react';

export function useUnsavedChanges(selector) {
  const dirty=useRef(false);
  useEffect(()=>{
    const element=event=>event.target instanceof Element?event.target:event.target?.parentElement;
    const changed=event=>{if(element(event)?.closest(selector))dirty.current=true};
    const leave=event=>{if(dirty.current){event.preventDefault();event.returnValue=''}};
    const navigate=event=>{
      if(!dirty.current||!element(event)?.closest('a,.admin-nav button,.admin-student-switch button,.attendance-tabs button,.score-hub-tabs button'))return;
      if(!window.confirm('未保存の変更があります。変更を破棄して移動しますか？')){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()}else dirty.current=false;
    };
    document.addEventListener('change',changed,true);document.addEventListener('input',changed,true);document.addEventListener('click',navigate,true);window.addEventListener('beforeunload',leave);
    return()=>{document.removeEventListener('change',changed,true);document.removeEventListener('input',changed,true);document.removeEventListener('click',navigate,true);window.removeEventListener('beforeunload',leave)};
  },[selector]);
  return {markSaved:()=>{dirty.current=false},confirmDiscard:()=>!dirty.current||window.confirm('未保存の変更を破棄して再読み込みしますか？')};
}
