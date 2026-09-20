'use client';
import { useEffect,useState } from 'react';
import FeedbackForm from '@/components/FeedbackForm';
export default function ParentFeedbackPage(){const[studentKey,setStudentKey]=useState('');useEffect(()=>setStudentKey(new URLSearchParams(location.search).get('student')||''),[]);return <main className="parent-shell"><FeedbackForm studentKey={studentKey}/></main>}
