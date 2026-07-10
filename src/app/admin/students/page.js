'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '../../../firebaseConfig';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import GradeTag from '@/components/GradeTag';
import { getCurrentSeason } from '../../utils/season';
import './students.css';

const GRADES = [
  { value: 'ALL', label: '全員' },
  { value: '7', label: '中1' },
  { value: '8', label: '中2' },
  { value: '9', label: '中3' },
  { value: '10', label: '高1' },
  { value: '11', label: '高2' },
  { value: '12', label: '高3' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'attention', label: '要確認' },
  { value: 'banned', label: '出禁中' },
  { value: 'course', label: '講習タグあり' },
];

const SORT_OPTIONS = [
  { value: 'grade', label: '学年順' },
  { value: 'name', label: '名前順' },
  { value: 'points', label: '現在Ptが多い順' },
  { value: 'termPoints', label: '学期Ptが多い順' },
  { value: 'yellowCard', label: '注意が多い順' },
];

const POINT_FIELDS = [
  { key: 'points', label: '現在Pt', help: '景品交換で増減する残高' },
  { key: 'termPoints', label: '学期Pt', help: '交換で減らない学期ランキング用' },
  { key: 'totalEarnedPoints', label: '累計Pt', help: 'これまでに獲得した合計' },
  { key: 'experience', label: 'XP', help: 'レベル計算用' },
  { key: 'level', label: 'Lv', help: '表示レベル' },
];

const courseTagLabel = {
  spring_course: '🌸 春期',
  summer_course: '☀ 夏期',
  winter_course: '❄ 冬期',
  past_exam: '📄 公立過去問',
};

const gradeLabel = (g) =>
  ({
    7: '中1',
    8: '中2',
    9: '中3',
    10: '高1',
    11: '高2',
    12: '高3',
  }[Number(g)] || '-');

const displayName = (student) =>
  student?.realName || student?.displayName || student?.name || '名前未設定';

const formatDate = (value) => {
  if (!value) return '未設定';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString('ja-JP');
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '未設定' : date.toLocaleDateString('ja-JP');
};

const sortStudents = (students, sortKey) => {
  const list = [...students];
  return list.sort((a, b) => {
    if (sortKey === 'name') {
      return displayName(a).localeCompare(displayName(b), 'ja');
    }
    if (['points', 'termPoints', 'totalEarnedPoints', 'yellowCard'].includes(sortKey)) {
      return Number(b[sortKey] || 0) - Number(a[sortKey] || 0);
    }
    return (
      Number(a.grade || 0) - Number(b.grade || 0) ||
      displayName(a).localeCompare(displayName(b), 'ja')
    );
  });
};

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [filterGrade, setFilterGrade] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('grade');
  const [search, setSearch] = useState('');
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [savingField, setSavingField] = useState('');
  const [editValues, setEditValues] = useState({});

  const auth = getAuth();
  const router = useRouter();

  const selectedStudent = useMemo(
    () => students.find((student) => student.uid === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const updateLocalStudent = (uid, patch) => {
    setStudents((prev) =>
      prev.map((student) => (student.uid === uid ? { ...student, ...patch } : student))
    );
  };

  const loadStudents = async () => {
    const snap = await getDocs(collection(db, 'users'));
    const list = sortStudents(
      snap.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      })),
      'grade'
    );
    setStudents(list);
    if (!selectedStudentId && list.length > 0) setSelectedStudentId(list[0].uid);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      if (!adminSnap.exists()) {
        alert('管理者権限がありません');
        router.push('/mypage');
        return;
      }

      try {
        await loadStudents();
      } catch (error) {
        console.error(error);
        setNotice('生徒情報を読み込めませんでした。');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const middle = students.filter((student) => Number(student.grade) >= 7 && Number(student.grade) <= 9);
    const high = students.filter((student) => Number(student.grade) >= 10 && Number(student.grade) <= 12);
    const attention = students.filter((student) => Number(student.yellowCard || 0) > 0 || student.isBanned);
    const totalCurrentPoints = students.reduce((sum, student) => sum + Number(student.points || 0), 0);
    return { total: students.length, middle: middle.length, high: high.length, attention: attention.length, totalCurrentPoints };
  }, [students]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = students.filter((student) => {
      if (filterGrade !== 'ALL' && Number(student.grade) !== Number(filterGrade)) return false;
      if (statusFilter === 'attention' && !student.isBanned && Number(student.yellowCard || 0) === 0) return false;
      if (statusFilter === 'banned' && !student.isBanned) return false;
      if (statusFilter === 'course' && !(student.courseTags || []).length) return false;
      if (!keyword) return true;
      return `${displayName(student)} ${student.displayName || ''} ${student.uid}`
        .toLowerCase()
        .includes(keyword);
    });
    return sortStudents(filtered, sortKey);
  }, [students, filterGrade, statusFilter, search, sortKey]);

  useEffect(() => {
    if (filteredStudents.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!selectedStudentId || !filteredStudents.some((student) => student.uid === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0].uid);
    }
  }, [filteredStudents, selectedStudentId]);

  const updateGrade = async (uid, newGrade) => {
    setSavingField(`${uid}:grade`);
    try {
      await updateDoc(doc(db, 'users', uid), {
        grade: Number(newGrade),
        updatedAt: serverTimestamp(),
      });
      updateLocalStudent(uid, { grade: Number(newGrade) });
      setNotice('学年を更新しました。');
    } finally {
      setSavingField('');
    }
  };

  const updateUserValue = async (uid, field, value) => {
    const safe = Math.max(0, Number(value || 0));
    const target = students.find((s) => s.uid === uid);
    const update = { [field]: safe, updatedAt: serverTimestamp() };
    setSavingField(`${uid}:${field}`);
    try {
      if (field === 'points') {
        const difference = safe - Number(target?.points || 0);
        if (difference !== 0) {
          const batch = writeBatch(db);
          batch.update(doc(db, 'users', uid), update);
          batch.set(doc(collection(db, 'users', uid, 'pointHistory')), {
            type: 'balanceAdjustment',
            amount: difference,
            note: '管理者による現在ポイント調整',
            affectsEarnedPoints: false,
            seasonId: getCurrentSeason().id,
            createdAt: serverTimestamp(),
          });
          await batch.commit();
        } else {
          await updateDoc(doc(db, 'users', uid), update);
        }
      } else {
        await updateDoc(doc(db, 'users', uid), update);
      }

      updateLocalStudent(uid, { [field]: safe });
      setEditValues((prev) => ({
        ...prev,
        [uid]: { ...prev[uid], [field]: undefined },
      }));
      setNotice(`${displayName(target)} の${POINT_FIELDS.find((item) => item.key === field)?.label || field}を更新しました。`);
    } catch (error) {
      console.error(error);
      setNotice('更新に失敗しました。通信状態を確認してください。');
    } finally {
      setSavingField('');
    }
  };

  const changeValue = (uid, field, delta) => {
    const target = students.find((s) => s.uid === uid);
    const current = target?.[field] ?? 0;
    updateUserValue(uid, field, current + delta);
  };

  const updateName = async (uid, value) => {
    const name = value.trim();
    if (!name) return setNotice('名前は空にできません。');
    setSavingField(`${uid}:realName`);
    try {
      await updateDoc(doc(db, 'users', uid), {
        realName: name,
        displayName: name,
        updatedAt: serverTimestamp(),
      });
      updateLocalStudent(uid, { realName: name, displayName: name });
      setEditValues((prev) => ({ ...prev, [uid]: { ...prev[uid], realName: undefined } }));
      setNotice('名前を更新しました。');
    } finally {
      setSavingField('');
    }
  };

  const addYellowCard = async (uid, current) => {
    const next = Number(current || 0) + 1;
    await updateDoc(doc(db, 'users', uid), { yellowCard: next, updatedAt: serverTimestamp() });
    updateLocalStudent(uid, { yellowCard: next });
    setNotice('イエローカードを追加しました。');
  };

  const resetYellowCard = async (uid) => {
    await updateDoc(doc(db, 'users', uid), { yellowCard: 0, updatedAt: serverTimestamp() });
    updateLocalStudent(uid, { yellowCard: 0 });
    setNotice('イエローカードをリセットしました。');
  };

  const banStudent = async (uid) => {
    const until = new Date();
    until.setDate(until.getDate() + 7);

    await updateDoc(doc(db, 'users', uid), {
      isBanned: true,
      banUntil: until,
      updatedAt: serverTimestamp(),
    });

    updateLocalStudent(uid, { isBanned: true, banUntil: until });
    setNotice('7日間の出禁を設定しました。');
  };

  const unbanStudent = async (uid) => {
    await updateDoc(doc(db, 'users', uid), {
      isBanned: false,
      banUntil: null,
      updatedAt: serverTimestamp(),
    });
    updateLocalStudent(uid, { isBanned: false, banUntil: null });
    setNotice('出禁を解除しました。');
  };

  const confiscateAllPoints = async (student) => {
    if (!student) return;
    const name = displayName(student);
    const currentPoints = Number(student.points || 0);
    const termPoints = Number(student.termPoints || 0);
    const totalEarnedPoints = Number(student.totalEarnedPoints || 0);
    const targetAmount = Math.max(currentPoints, termPoints, totalEarnedPoints);

    if (targetAmount <= 0) {
      return setNotice(`${name} は没収対象のポイントがありません。`);
    }

    const firstConfirm = window.confirm(
      `${name} の全ポイントを没収します。\n\n現在Pt: ${currentPoints.toLocaleString()}pt\n学期Pt: ${termPoints.toLocaleString()}pt\n累計Pt: ${totalEarnedPoints.toLocaleString()}pt\n\nこの操作はランキングにも反映されます。続行しますか？`
    );
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
      `最終確認です。\n${name} の現在Pt・学期Pt・累計Ptをすべて0にします。よろしいですか？`
    );
    if (!secondConfirm) return;

    setSavingField(`${student.uid}:confiscate`);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', student.uid);
      const adminUid = auth.currentUser?.uid || null;
      batch.update(userRef, {
        points: 0,
        termPoints: 0,
        totalEarnedPoints: 0,
        lastPointConfiscationAt: serverTimestamp(),
        lastPointConfiscationBy: adminUid,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, 'users', student.uid, 'pointHistory')), {
        type: 'penalty',
        amount: -targetAmount,
        note: `不正による全ポイント没収（現在${currentPoints} / 学期${termPoints} / 累計${totalEarnedPoints}）`,
        affectsEarnedPoints: true,
        seasonId: getCurrentSeason().id,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });
      batch.set(doc(collection(db, 'illegal_checkins')), {
        uid: student.uid,
        type: 'point_confiscation',
        studentName: name,
        pointsBefore: currentPoints,
        termPointsBefore: termPoints,
        totalEarnedPointsBefore: totalEarnedPoints,
        handledBy: adminUid,
        time: serverTimestamp(),
      });
      await batch.commit();
      updateLocalStudent(student.uid, {
        points: 0,
        termPoints: 0,
        totalEarnedPoints: 0,
        lastPointConfiscationAt: new Date(),
        lastPointConfiscationBy: adminUid,
      });
      setNotice(`${name} の全ポイントを没収しました。`);
    } catch (error) {
      console.error(error);
      setNotice('ポイント没収に失敗しました。通信状態または権限を確認してください。');
    } finally {
      setSavingField('');
    }
  };

  const toggleCourseTag = async (tag) => {
    if (!selectedStudent) return;
    const current = selectedStudent.courseTags || [];
    const updated = current.includes(tag)
      ? current.filter((value) => value !== tag)
      : [...current, tag];

    await updateDoc(doc(db, 'users', selectedStudent.uid), {
      courseTags: updated,
      updatedAt: serverTimestamp(),
    });

    updateLocalStudent(selectedStudent.uid, { courseTags: updated });
  };

  if (loading) return <div className="students-loading">読み込み中...</div>;

  return (
    <main className="students-page">
      <header className="students-hero">
        <div>
          <span>STUDENT CONTROL</span>
          <h1>生徒管理</h1>
          <p>検索、状態確認、ポイント調整、講習タグ設定をこの画面でまとめて行います。</p>
        </div>
        <button className="refresh-button" onClick={loadStudents}>
          最新に更新
        </button>
      </header>

      <section className="students-summary">
        <article><span>登録生徒</span><strong>{stats.total}</strong></article>
        <article><span>中学生</span><strong>{stats.middle}</strong></article>
        <article><span>高校生</span><strong>{stats.high}</strong></article>
        <article className={stats.attention ? 'attention' : ''}><span>要確認</span><strong>{stats.attention}</strong></article>
        <article><span>現在Pt合計</span><strong>{stats.totalCurrentPoints.toLocaleString()}</strong></article>
      </section>

      <section className="students-toolbar">
        <label className="search-box">
          <span>名前検索</span>
          <input
            type="search"
            placeholder="氏名・表示名・UIDで検索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label>
          学年
          <select value={filterGrade} onChange={(event) => setFilterGrade(event.target.value)}>
            {GRADES.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}
          </select>
        </label>

        <label>
          状態
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_FILTERS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </label>

        <label>
          並び替え
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
            {SORT_OPTIONS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
          </select>
        </label>
      </section>

      {notice && <p className="students-notice">{notice}</p>}

      <section className="students-workspace">
        <div className="students-list-panel">
          <div className="list-heading">
            <h2>生徒一覧</h2>
            <span>{filteredStudents.length}人</span>
          </div>

          <div className="students-list">
            {filteredStudents.length === 0 ? (
              <div className="students-empty">条件に合う生徒がいません。</div>
            ) : filteredStudents.map((student) => (
              <button
                type="button"
                key={student.uid}
                className={`student-row ${selectedStudentId === student.uid ? 'active' : ''}`}
                onClick={() => setSelectedStudentId(student.uid)}
              >
                <div className="student-avatar">
                  {displayName(student).slice(0, 1)}
                </div>
                <div className="student-row-main">
                  <strong>{displayName(student)}</strong>
                  <span>{gradeLabel(student.grade)} / Lv {student.level ?? 1}</span>
                </div>
                <div className="student-row-points">
                  <strong>{Number(student.points || 0).toLocaleString()}</strong>
                  <span>現在Pt</span>
                </div>
                <div className="row-badges">
                  {Number(student.yellowCard || 0) > 0 && <span className="yellowcard-badge">⚠ {student.yellowCard}</span>}
                  {student.isBanned && <span className="ban-badge">出禁</span>}
                  {(student.courseTags || []).length > 0 && <span className="course-badge">講習</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="student-detail-panel">
          {!selectedStudent ? (
            <div className="students-empty">左の一覧から生徒を選択してください。</div>
          ) : (
            <>
              <div className="detail-head">
                <div>
                  <span>{gradeLabel(selectedStudent.grade)}</span>
                  <h2>{displayName(selectedStudent)}</h2>
                  <p>UID: {selectedStudent.uid}</p>
                </div>
                <GradeTag
                  grade={gradeLabel(selectedStudent.grade)}
                  onChange={(grade) => updateGrade(selectedStudent.uid, grade)}
                />
              </div>

              <div className="name-editor">
                <label>
                  名前
                  <input
                    value={editValues[selectedStudent.uid]?.realName ?? displayName(selectedStudent)}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        [selectedStudent.uid]: { ...prev[selectedStudent.uid], realName: event.target.value },
                      }))
                    }
                    onBlur={(event) => updateName(selectedStudent.uid, event.target.value)}
                  />
                </label>
              </div>

              <div className="status-cards">
                <article className={selectedStudent.isBanned ? 'danger' : ''}>
                  <span>利用状態</span>
                  <strong>{selectedStudent.isBanned ? '出禁中' : '通常'}</strong>
                  <small>期限: {formatDate(selectedStudent.banUntil)}</small>
                </article>
                <article className={Number(selectedStudent.yellowCard || 0) > 0 ? 'warning' : ''}>
                  <span>イエローカード</span>
                  <strong>{selectedStudent.yellowCard || 0}</strong>
                  <small>注意が必要な回数</small>
                </article>
              </div>

              <section className="point-editor">
                <h3>数値を調整</h3>
                {POINT_FIELDS.map((field) => {
                  const value = editValues[selectedStudent.uid]?.[field.key] ?? selectedStudent[field.key] ?? (field.key === 'level' ? 1 : 0);
                  return (
                    <label key={field.key} className="point-row">
                      <div>
                        <strong>{field.label}</strong>
                        <span>{field.help}</span>
                      </div>
                      <div className="number-control">
                        {['points', 'level'].includes(field.key) && (
                          <button
                            type="button"
                            disabled={Boolean(savingField)}
                            onClick={() => changeValue(selectedStudent.uid, field.key, -1)}
                          >
                            -
                          </button>
                        )}
                        <input
                          type="number"
                          min="0"
                          value={value}
                          disabled={savingField === `${selectedStudent.uid}:${field.key}`}
                          onChange={(event) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [selectedStudent.uid]: { ...prev[selectedStudent.uid], [field.key]: event.target.value },
                            }))
                          }
                          onBlur={(event) => updateUserValue(selectedStudent.uid, field.key, event.target.value)}
                        />
                        {['points', 'level'].includes(field.key) && (
                          <button
                            type="button"
                            disabled={Boolean(savingField)}
                            onClick={() => changeValue(selectedStudent.uid, field.key, 1)}
                          >
                            +
                          </button>
                        )}
                      </div>
                    </label>
                  );
                })}
              </section>

              <section className="detail-actions">
                <h3>規律・講習</h3>
                <div className="action-grid">
                  <button onClick={() => addYellowCard(selectedStudent.uid, selectedStudent.yellowCard)}>⚠ 注意 +1</button>
                  <button onClick={() => resetYellowCard(selectedStudent.uid)}>注意リセット</button>
                  {selectedStudent.isBanned ? (
                    <button className="safe" onClick={() => unbanStudent(selectedStudent.uid)}>出禁解除</button>
                  ) : (
                    <button className="danger" onClick={() => banStudent(selectedStudent.uid)}>7日間出禁</button>
                  )}
                  <button onClick={() => setCourseModalOpen(true)}>講習タグを編集</button>
                </div>

                <div className="course-tags">
                  {(selectedStudent.courseTags || []).length === 0 ? (
                    <span>講習タグなし</span>
                  ) : selectedStudent.courseTags.map((tag) => (
                    <span key={tag}>{courseTagLabel[tag] || tag}</span>
                  ))}
                </div>
              </section>

              <section className="confiscation-panel">
                <div>
                  <h3>不正対応</h3>
                  <p>不正が確定した場合、現在Pt・学期Pt・累計Ptをすべて0にします。ポイント履歴と不正ログに記録されます。</p>
                </div>
                <button
                  type="button"
                  className="confiscate-button"
                  disabled={Boolean(savingField)}
                  onClick={() => confiscateAllPoints(selectedStudent)}
                >
                  全ポイント没収
                </button>
              </section>
            </>
          )}
        </aside>
      </section>

      {courseModalOpen && selectedStudent && (
        <div className="students-modal-overlay" onClick={() => setCourseModalOpen(false)}>
          <div className="students-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <span>{gradeLabel(selectedStudent.grade)}</span>
              <h2>{displayName(selectedStudent)} の講習タグ</h2>
            </div>
            {Object.keys(courseTagLabel).map((tag) => (
              <button
                type="button"
                key={tag}
                className={(selectedStudent.courseTags || []).includes(tag) ? 'course-tag-btn active' : 'course-tag-btn'}
                onClick={() => toggleCourseTag(tag)}
              >
                {courseTagLabel[tag]}
              </button>
            ))}
            <button className="modal-close" onClick={() => setCourseModalOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
    </main>
  );
}
