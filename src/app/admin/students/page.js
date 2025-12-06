'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../../../firebaseConfig';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import GradeTag from '@/components/GradeTag';
import './students.css';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filterGrade, setFilterGrade] = useState('ALL');

  const [titles, setTitles] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // ⭐ 追加：編集中の値を保持
  const [editValues, setEditValues] = useState({});

  const auth = getAuth();
  const router = useRouter();

  // ⭐ 管理者チェック
  const checkAdmin = async (uid) => {
    const adminRef = doc(db, 'admins', uid);
    const adminSnap = await getDoc(adminRef);
    return adminSnap.exists();
  };

  // ⭐ 初期ロード
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

      const studentsSnap = await getDocs(collection(db, 'users'));
      const studentList = studentsSnap.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      }));

      const titlesSnap = await getDocs(collection(db, 'titles'));
      const titleList = titlesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setStudents(studentList);
      setFiltered(studentList);
      setTitles(titleList);
      setLoading(false);
    });
  }, []);

  // ⭐ 学年ラベル
  const gradeLabel = (g) =>
    ({
      1: '小1',
      2: '小2',
      3: '小3',
      4: '小4',
      5: '小5',
      6: '小6',
      7: '中1',
      8: '中2',
      9: '中3',
      10: '高1',
      11: '高2',
      12: '高3',
    }[g] || '-');

  // ⭐ 学年変更
  const updateGrade = async (uid, newGrade) => {
    await updateDoc(doc(db, 'users', uid), { grade: newGrade });

    setStudents((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, grade: newGrade } : s))
    );
  };
    
    // ⭐ イエローカード付与
    const addYellowCard = async (uid, current) => {
      const newValue = (current || 0) + 1;
      await updateDoc(doc(db, "users", uid), { yellowCard: newValue });

      setStudents(prev =>
        prev.map(s => (s.uid === uid ? { ...s, yellowCard: newValue } : s))
      );
    };

    // ⭐ イエローカードリセット
    const resetYellowCard = async (uid) => {
      await updateDoc(doc(db, "users", uid), { yellowCard: 0 });

      setStudents(prev =>
        prev.map(s => (s.uid === uid ? { ...s, yellowCard: 0 } : s))
      );
    };

    // ⭐ 出禁（1週間）
    const banStudent = async (uid) => {
      const banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + 7);

      await updateDoc(doc(db, "users", uid), {
        isBanned: true,
        banUntil: banUntil,
      });

      setStudents(prev =>
        prev.map(s => (s.uid === uid ? { ...s, isBanned: true, banUntil } : s))
      );
    };

    // ⭐ 出禁の自動解除（マイページ・ログイン時などでチェック）
    const checkBanStatus = async (uid, userData) => {
      if (!userData.banUntil) return;

      const now = new Date();
      const end = userData.banUntil.toDate ? userData.banUntil.toDate() : userData.banUntil;

      if (now > end) {
        await updateDoc(doc(db, "users", uid), {
          isBanned: false,
          banUntil: null
        });
      }
    };

  // ⭐ フィルタ
  const applyFilter = (grade) => {
    setFilterGrade(grade);
    if (grade === 'ALL') {
      setFiltered(students);
      return;
    }
    setFiltered(students.filter((s) => s.grade === Number(grade)));
  };

  // ⭐ 値保存（直接入力版）
  const updateUserValue = async (uid, field, value) => {
    const safe = Math.max(0, Number(value));
    await updateDoc(doc(db, 'users', uid), { [field]: safe });

    setStudents((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, [field]: safe } : s))
    );

    // 入力欄の一時値を消す
    setEditValues((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], [field]: undefined },
    }));
  };

  // ⭐ ±1 ボタン
  const changeValue = (uid, field, delta) => {
    const target = students.find((s) => s.uid === uid);
    const current = target?.[field] ?? 0;
    updateUserValue(uid, field, current + delta);
  };

  // ⭐ 称号付与
  const handleGrantTitle = async (student, title) => {
    await setDoc(
      doc(db, `users/${student.uid}/titles/${title.id}`),
      {
        name: title.name,
        description: title.description || '',
        earnedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(doc(db, 'users', student.uid), {
      currentTitle: title.name,
    });

    alert(`「${title.name}」を付与しました`);
    setShowModal(false);
    setSelectedStudent(null);
  };

  const courseTagLabel = {
    spring_course: '🌸 春期',
    summer_course: '☀ 夏期',
    winter_course: '❄ 冬期',
  };

  // ⭐ 講習タグ
  const toggleCourseTag = async (tag) => {
    const s = selectedStudent;
    const current = s.courseTags || [];

    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];

    await updateDoc(doc(db, 'users', s.uid), { courseTags: updated });

    setStudents((prev) =>
      prev.map((st) => (st.uid === s.uid ? { ...st, courseTags: updated } : st))
    );
  };
    
    

  if (loading) return <div className="students-loading">読み込み中...</div>;

  return (
    <div className="students-page">
      <div className="students-header">
        <h1 className="students-title">生徒管理</h1>
        <p className="students-subtitle">
          経験値・ポイント・称号・講習タグ・学年を管理できます
        </p>
      </div>

      {/* フィルタ */}
      <div className="grade-filter">
        <button
          className={filterGrade === 'ALL' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => applyFilter('ALL')}
        >
          全員
        </button>

        {[7, 8, 9, 10, 11, 12].map((g) => (
          <button
            key={g}
            className={filterGrade === g ? 'filter-btn active' : 'filter-btn'}
            onClick={() => applyFilter(g)}
          >
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
                  <div className="student-card-header">
                    <div className="student-name">{s.realName}</div>

                    <GradeTag
                      grade={gradeLabel(s.grade)}
                      onChange={(newGrade) => updateGrade(s.uid, newGrade)}
                    />

                    <div className="course-tags-area">
                      {(s.courseTags || []).map((t) => (
                        <span key={t} className="course-tag">
                          {courseTagLabel[t]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* ✔ ここにステータス管理（レベル・経験値・ポイント）がある */}

                  {/* ⭐⭐ ここに追記（正しい位置） ⭐⭐ */}
                  <div className="discipline-buttons">
                    {/* イエローカード追加 */}
                    <button
                      className="yellow-btn"
                      onClick={() => addYellowCard(s.uid, s.yellowCard)}
                    >
                      ⚠ イエローカード +1
                    </button>

                    {/* リセット */}
                    <button
                      className="yellow-reset-btn"
                      onClick={() => resetYellowCard(s.uid)}
                    >
                      カードリセット
                    </button>

                    {/* 出禁 1週間 */}
                    <button
                      className="ban-btn"
                      onClick={() => banStudent(s.uid)}
                    >
                      🚫 出禁（1週間）
                    </button>
                  </div>
                  {/* ⭐⭐ ここまで ⭐⭐ */}

                  <div className="student-card-footer">
                    <button
                      className="title-modal-open-btn"
                      onClick={() => {
                        setSelectedStudent(s);
                        setShowModal(true);
                      }}
                    >
                      称号を付与
                    </button>

                    <button
                      className="course-modal-btn"
                      onClick={() => {
                        setSelectedStudent(s);
                        setCourseModalOpen(true);
                      }}
                    >
                      講習タグを編集
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          

      {/* 称号モーダル */}
      {showModal && selectedStudent && (
        <div className="students-modal-overlay">
          <div className="students-modal">
            <div className="students-modal-header">
              <h2>称号を付与：{selectedStudent.realName}</h2>
              <button className="modal-close-x" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="students-modal-body">
              <div className="titles-grid">
                {titles.map((t) => (
                  <button
                    key={t.id}
                    className="title-pill"
                    onClick={() => handleGrantTitle(selectedStudent, t)}
                  >
                    <div className="title-pill-name">{t.name}</div>
                    <div className="title-pill-desc">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 講習タグモーダル */}
      {courseModalOpen && selectedStudent && (
        <div className="students-modal-overlay">
          <div className="students-modal">
            <div className="students-modal-header">
              <h2>講習タグ：{selectedStudent.realName}</h2>
              <button className="modal-close-x" onClick={() => setCourseModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="students-modal-body">
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
            </div>

            <div className="students-modal-footer">
              <button className="modal-close-btn" onClick={() => setCourseModalOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
