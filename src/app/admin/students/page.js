'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../../../firebaseConfig';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import GradeTag from '@/components/GradeTag';
import './students.css';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filterGrade, setFilterGrade] = useState('ALL');
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  // ⭐ 編集中の値
  const [editValues, setEditValues] = useState({});

  const auth = getAuth();
  const router = useRouter();

  /* ---------- 管理者チェック ---------- */
  const checkAdmin = async (uid) => {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  };

  /* ---------- 初期ロード ---------- */
  useEffect(() => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      const isAdmin = await checkAdmin(user.uid);
      if (!isAdmin) {
        alert('管理者権限がありません');
        router.push('/mypage');
        return;
      }

      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      }));

      setStudents(list);
      setFiltered(list);
      setLoading(false);
    });
  }, []);

  /* ---------- 学年ラベル（中高生） ---------- */
  const gradeLabel = (g) =>
    ({
      7: '中1',
      8: '中2',
      9: '中3',
      10: '高1',
      11: '高2',
      12: '高3',
    }[g] || '-');

  /* ---------- 学年変更 ---------- */
  const updateGrade = async (uid, newGrade) => {
    await updateDoc(doc(db, 'users', uid), { grade: newGrade });
    setStudents((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, grade: newGrade } : s))
    );
  };

  /* ---------- フィルタ ---------- */
  const applyFilter = (grade) => {
    setFilterGrade(grade);
    if (grade === 'ALL') {
      setFiltered(students);
    } else {
      setFiltered(students.filter((s) => s.grade === Number(grade)));
    }
  };

  /* ---------- 値直接編集 ---------- */
  const updateUserValue = async (uid, field, value) => {
    const safe = Math.max(0, Number(value));
    await updateDoc(doc(db, 'users', uid), { [field]: safe });

    setStudents((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, [field]: safe } : s))
    );

    setEditValues((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], [field]: undefined },
    }));
  };

  const changeValue = (uid, field, delta) => {
    const target = students.find((s) => s.uid === uid);
    const current = target?.[field] ?? 0;
    updateUserValue(uid, field, current + delta);
  };

  /* ---------- イエローカード ---------- */
  const addYellowCard = async (uid, current) => {
    const v = (current || 0) + 1;
    await updateDoc(doc(db, 'users', uid), { yellowCard: v });
    setStudents((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, yellowCard: v } : s))
    );
  };

  const resetYellowCard = async (uid) => {
    await updateDoc(doc(db, 'users', uid), { yellowCard: 0 });
    setStudents((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, yellowCard: 0 } : s))
    );
  };

  /* ---------- 出禁 ---------- */
  const banStudent = async (uid) => {
    const until = new Date();
    until.setDate(until.getDate() + 7);

    await updateDoc(doc(db, 'users', uid), {
      isBanned: true,
      banUntil: until,
    });

    setStudents((prev) =>
      prev.map((s) =>
        s.uid === uid ? { ...s, isBanned: true, banUntil: until } : s
      )
    );
  };

  /* ---------- 講習タグ ---------- */
  const courseTagLabel = {
    spring_course: '🌸 春期',
    summer_course: '☀ 夏期',
    winter_course: '❄ 冬期',
      past_exam: '📄 公立過去問',
  };

  const toggleCourseTag = async (tag) => {
    const s = selectedStudent;
    const current = s.courseTags || [];

    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];

    await updateDoc(doc(db, 'users', s.uid), { courseTags: updated });

    setStudents((prev) =>
      prev.map((st) =>
        st.uid === s.uid ? { ...st, courseTags: updated } : st
      )
    );
  };

  if (loading) return <div className="students-loading">読み込み中...</div>;

  return (
    <div className="students-page">
      <h1 className="students-title">生徒管理</h1>

      {/* フィルタ */}
      <div className="grade-filter">
        <button onClick={() => applyFilter('ALL')}>全員</button>
        {[7, 8, 9, 10, 11, 12].map((g) => (
          <button key={g} onClick={() => applyFilter(g)}>
            {gradeLabel(g)}
          </button>
        ))}
      </div>

      {/* 生徒一覧 */}
      <div className="students-grid">
        {filtered.map((s) => {
          const ev = editValues[s.uid] || {};
          return (
            <div key={s.uid} className="student-card">
              <div className="student-name">{s.realName}</div>
                  
                  <div className="student-status-badges">
                    {/* イエローカード */}
                    {(s.yellowCard ?? 0) > 0 && (
                      <span className="yellowcard-badge">
                        ⚠️ {s.yellowCard}
                      </span>
                    )}

                    {/* 出禁 */}
                    {s.isBanned && (
                      <span className="ban-badge">
                        🚫 出禁中
                      </span>
                    )}
                  </div>

              <GradeTag
                grade={gradeLabel(s.grade)}
                onChange={(g) => updateGrade(s.uid, g)}
              />

              {/* 数値編集 */}
              <div className="status-edit">
                <div>
                  Lv：
                  <button onClick={() => changeValue(s.uid, 'level', -1)}>-</button>
                  <input
                    type="number"
                    value={ev.level ?? s.level ?? 1}
                    onChange={(e) =>
                      setEditValues((p) => ({
                        ...p,
                        [s.uid]: { ...p[s.uid], level: e.target.value },
                      }))
                    }
                    onBlur={(e) =>
                      updateUserValue(s.uid, 'level', e.target.value)
                    }
                  />
                  <button onClick={() => changeValue(s.uid, 'level', 1)}>+</button>
                </div>

                <div>
                  XP：
                  <input
                    type="number"
                    value={ev.experience ?? s.experience ?? 0}
                    onChange={(e) =>
                      setEditValues((p) => ({
                        ...p,
                        [s.uid]: { ...p[s.uid], experience: e.target.value },
                      }))
                    }
                    onBlur={(e) =>
                      updateUserValue(s.uid, 'experience', e.target.value)
                    }
                  />
                </div>

                <div>
                  Pt：
                  <input
                    type="number"
                    value={ev.points ?? s.points ?? 0}
                    onChange={(e) =>
                      setEditValues((p) => ({
                        ...p,
                        [s.uid]: { ...p[s.uid], points: e.target.value },
                      }))
                    }
                    onBlur={(e) =>
                      updateUserValue(s.uid, 'points', e.target.value)
                    }
                  />
                </div>
              </div>

              {/* 規律 */}
              <div className="discipline-buttons">
                <button onClick={() => addYellowCard(s.uid, s.yellowCard)}>
                  ⚠ +1
                </button>
                <button onClick={() => resetYellowCard(s.uid)}>
                  リセット
                </button>
                <button onClick={() => banStudent(s.uid)}>
                  🚫 出禁
                </button>
              </div>

              <button
                onClick={() => {
                  setSelectedStudent(s);
                  setCourseModalOpen(true);
                }}
              >
                講習タグ
              </button>
            </div>
          );
        })}
      </div>

      {/* 講習タグモーダル */}
      {courseModalOpen && selectedStudent && (
        <div className="students-modal-overlay">
          <div className="students-modal">
            {Object.keys(courseTagLabel).map((tag) => (
              <button
                key={tag}
                className={
                  (selectedStudent.courseTags || []).includes(tag)
                    ? 'course-tag-btn active'
                    : 'course-tag-btn'
                }
                onClick={() => toggleCourseTag(tag)}
              >
                {courseTagLabel[tag]}
              </button>
            ))}
            <button onClick={() => setCourseModalOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
