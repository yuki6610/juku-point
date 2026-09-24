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
import { useAcademicContext } from '@/lib/useAcademicContext';
import './students.css';
import './enrollment.css';
import ElementaryStudentManager from './ElementaryStudentManager';
import { availableStudentGrades } from '@/lib/studentFilterOptions.mjs';

const STATUS_FILTERS = [
  { value: 'active', label: '在籍中' },
  { value: 'withdrawn', label: '退塾者' },
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
  exam_private: '🏫 私立入試',
  exam_recommendation: '⭐ 公立推薦',
  exam_general: '📝 公立一般',
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
const studentRef = (uid) => uid.startsWith('elementary_')
  ? doc(db, 'adminStudents', uid.slice(11))
  : doc(db, 'users', uid);
const pointHistoryRef = (uid) => collection(studentRef(uid), 'pointHistory');

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
  const academic = useAcademicContext();
  const [students, setStudents] = useState([]);
  const [filterGrade, setFilterGrade] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortKey, setSortKey] = useState('grade');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [savingField, setSavingField] = useState('');
  const [editValues, setEditValues] = useState({});
  const [studentType, setStudentType] = useState('accounts');

  const auth = getAuth();
  const router = useRouter();

  const selectedStudent = useMemo(
    () => students.find((student) => student.uid === selectedStudentId) || null,
    [students, selectedStudentId]
  );
  const availableGrades = useMemo(() => availableStudentGrades(students), [students]);

  const updateLocalStudent = (uid, patch) => {
    setStudents((prev) =>
      prev.map((student) => (student.uid === uid ? { ...student, ...patch } : student))
    );
  };

  const loadStudents = async () => {
    const [snap, promoted] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'adminStudents')),
    ]);
    const list = sortStudents(
      [...snap.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      })), ...promoted.docs.filter((d) => Number(d.data().grade) >= 7).map((d) => ({
        ...d.data(),
        uid: `elementary_${d.id}`,
      }))],
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
    const withdrawn = students.filter((student) => student.active === false || student.enrollmentStatus === 'withdrawn').length;
    return { total: students.length, middle: middle.length, high: high.length, attention: attention.length, withdrawn, totalCurrentPoints };
  }, [students]);

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      if (filterGrade !== 'ALL' && Number(student.grade) !== Number(filterGrade)) return false;
      const isWithdrawn = student.active === false || student.enrollmentStatus === 'withdrawn';
      if (statusFilter === 'active' && isWithdrawn) return false;
      if (statusFilter === 'withdrawn' && !isWithdrawn) return false;
      if (statusFilter === 'attention' && !student.isBanned && Number(student.yellowCard || 0) === 0) return false;
      if (statusFilter === 'banned' && !student.isBanned) return false;
      if (statusFilter === 'course' && !(student.courseTags || []).length) return false;
      return true;
    });
    return sortStudents(filtered, sortKey);
  }, [students, filterGrade, statusFilter, sortKey]);

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
      await updateDoc(studentRef(uid), {
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
    if (['points', 'termPoints'].includes(field) && !academic.current) return setNotice(academic.error || '学期設定を読み込み中です。');
    const safe = Math.max(0, Number(value || 0));
    const target = students.find((s) => s.uid === uid);
    const update = { [field]: safe, updatedAt: serverTimestamp() };
    setSavingField(`${uid}:${field}`);
    try {
      if (field === 'points') {
        const difference = safe - Number(target?.points || 0);
        if (difference !== 0) {
          const batch = writeBatch(db);
          batch.update(studentRef(uid), update);
          batch.set(doc(pointHistoryRef(uid)), {
            type: 'balanceAdjustment',
            amount: difference,
            note: '管理者による現在ポイント調整',
            affectsEarnedPoints: false,
            seasonId: academic.current.id,
            createdAt: serverTimestamp(),
          });
          await batch.commit();
        } else {
          await updateDoc(studentRef(uid), update);
        }
      } else {
        await updateDoc(studentRef(uid), update);
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
      await updateDoc(studentRef(uid), {
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
    await updateDoc(studentRef(uid), { yellowCard: next, updatedAt: serverTimestamp() });
    updateLocalStudent(uid, { yellowCard: next });
    setNotice('イエローカードを追加しました。');
  };

  const resetYellowCard = async (uid) => {
    await updateDoc(studentRef(uid), { yellowCard: 0, updatedAt: serverTimestamp() });
    updateLocalStudent(uid, { yellowCard: 0 });
    setNotice('イエローカードをリセットしました。');
  };

  const banStudent = async (uid) => {
    const until = new Date();
    until.setDate(until.getDate() + 7);

    await updateDoc(studentRef(uid), {
      isBanned: true,
      banUntil: until,
      updatedAt: serverTimestamp(),
    });

    updateLocalStudent(uid, { isBanned: true, banUntil: until });
    setNotice('7日間の出禁を設定しました。');
  };

  const unbanStudent = async (uid) => {
    await updateDoc(studentRef(uid), {
      isBanned: false,
      banUntil: null,
      updatedAt: serverTimestamp(),
    });
    updateLocalStudent(uid, { isBanned: false, banUntil: null });
    setNotice('出禁を解除しました。');
  };

  const setEnrollmentStatus = async (student, withdrawn) => {
    if (withdrawn && !window.confirm(`${displayName(student)}さんを退塾扱いにしますか？\n過去の成績・ポイント・出欠記録は残ります。`)) return;
    setSavingField(`${student.uid}:enrollment`);
    try {
      await updateDoc(studentRef(student.uid), { active: !withdrawn, enrollmentStatus: withdrawn ? 'withdrawn' : 'active', withdrawnAt: withdrawn ? serverTimestamp() : null, updatedAt: serverTimestamp() });
      updateLocalStudent(student.uid, { active: !withdrawn, enrollmentStatus: withdrawn ? 'withdrawn' : 'active', withdrawnAt: withdrawn ? new Date() : null });
      setNotice(withdrawn ? `${displayName(student)}さんを退塾者へ移動しました。` : `${displayName(student)}さんを在籍中へ戻しました。`);
    } catch (error) { console.error(error); setNotice('在籍状態を更新できませんでした。'); }
    finally { setSavingField(''); }
  };

  const confiscateAllPoints = async (student) => {
    if (!student) return;
    const name = displayName(student);
    const currentPoints = Number(student.points || 0);
    const termPoints = Number(student.termPoints || 0);
    const totalEarnedPoints = Number(student.totalEarnedPoints || 0);
    const targetAmount = Math.max(currentPoints, termPoints, totalEarnedPoints);
    if (!academic.current) return setNotice(academic.error || '学期設定を読み込み中です。');

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
      const userRef = studentRef(student.uid);
      const adminUid = auth.currentUser?.uid || null;
      batch.update(userRef, {
        points: 0,
        termPoints: 0,
        totalEarnedPoints: 0,
        lastPointConfiscationAt: serverTimestamp(),
        lastPointConfiscationBy: adminUid,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(pointHistoryRef(student.uid)), {
        type: 'penalty',
        amount: -targetAmount,
        note: `不正による全ポイント没収（現在${currentPoints} / 学期${termPoints} / 累計${totalEarnedPoints}）`,
        affectsEarnedPoints: true,
        seasonId: academic.current.id,
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

  if (loading) return <div className="students-loading">読み込み中...</div>;

  return (
    <main className="students-page">
      <header className="students-hero">
        <div>
          <span>STUDENT CONTROL</span>
          <h1>生徒管理</h1>
          <p>在籍状態、ポイント、規律情報を確認・編集します。タグ操作は「タグ一括管理」で行います。</p>
        </div>
        <div className="students-head-actions"><button className="refresh-button" onClick={()=>router.push('/admin/student-notes')}>表形式の生徒メモ</button><button className="refresh-button" onClick={loadStudents}>最新に更新</button></div>
      </header>

      <section className="students-summary">
        <article><span>アカウント生徒</span><strong>{stats.total}</strong></article>
        <article><span>中学生</span><strong>{stats.middle}</strong></article>
        <article><span>高校生</span><strong>{stats.high}</strong></article>
        <article className={stats.attention ? 'attention' : ''}><span>要確認</span><strong>{stats.attention}</strong></article>
        <article><span>現在Pt合計</span><strong>{stats.totalCurrentPoints.toLocaleString()}</strong></article>
        <article><span>退塾者</span><strong>{stats.withdrawn}</strong></article>
      </section>

      <nav className="student-type-tabs" aria-label="生徒種別">
        <button className={studentType === 'accounts' ? 'active' : ''} onClick={() => setStudentType('accounts')}>中学生・高校生</button>
        <button className={studentType === 'elementary' ? 'active' : ''} onClick={() => setStudentType('elementary')}>小学生の登録・編集</button>
      </nav>

      {notice && <p className="students-notice">{notice}</p>}

      {studentType === 'elementary' ? <ElementaryStudentManager onNotice={setNotice} /> : <>

      <section className="students-toolbar">
        <label>
          学年
          <select value={filterGrade} onChange={(event) => setFilterGrade(event.target.value)}>
            <option value="ALL">全員</option>
            {availableGrades.map((value) => <option key={value} value={value}>{gradeLabel(value)}</option>)}
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
                  {[...(student.tags || []), ...(student.courseTags || [])].slice(0, 3).map((tag) => <span className="student-tag-chip" key={tag}>{courseTagLabel[tag] || tag}</span>)}
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

              <nav className="student-record-links" aria-label="生徒カルテ"><button onClick={()=>router.push(`/admin/lesson-records?student=user_${selectedStudent.uid}`)}>学習・出欠</button><button onClick={()=>router.push(`/admin/academics?tab=records&student=${selectedStudent.uid}`)}>成績</button><button onClick={()=>router.push(`/admin/points?tab=history&student=${selectedStudent.uid}`)}>ポイント履歴</button><button onClick={()=>router.push(`/parent?student=user_${selectedStudent.uid}`)}>保護者表示</button></nav>

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
                  />
                </label>
                <button type="button" disabled={Boolean(savingField)} onClick={() => updateName(selectedStudent.uid, editValues[selectedStudent.uid]?.realName ?? displayName(selectedStudent))}>名前を保存</button>
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
                        <button type="button" className="save-value" disabled={Boolean(savingField)} onClick={() => updateUserValue(selectedStudent.uid, field.key, value)}>保存</button>
                      </div>
                    </label>
                  );
                })}
              </section>

              <section className="detail-actions">
                <h3>規律・対象情報</h3>
                <div className="action-grid">
                  <button onClick={() => addYellowCard(selectedStudent.uid, selectedStudent.yellowCard)}>⚠ 注意 +1</button>
                  <button onClick={() => resetYellowCard(selectedStudent.uid)}>注意リセット</button>
                  {selectedStudent.isBanned ? (
                    <button className="safe" onClick={() => unbanStudent(selectedStudent.uid)}>出禁解除</button>
                  ) : (
                    <button className="danger" onClick={() => banStudent(selectedStudent.uid)}>7日間出禁</button>
                  )}
                </div>

                <div className="course-tags">
                  {(selectedStudent.courseTags || []).length === 0 ? (
                    <span>対象タグなし</span>
                  ) : selectedStudent.courseTags.map((tag) => (
                    <span key={tag}>{courseTagLabel[tag] || tag}</span>
                  ))}
                  <button type="button" onClick={()=>router.push('/admin/tags')}>タグ一括管理を開く</button>
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
              <section className="enrollment-panel">
                <div><h3>在籍状態</h3><p>退塾にしても過去の成績・ポイント・出欠記録は削除されません。</p></div>
                {selectedStudent.active === false || selectedStudent.enrollmentStatus === 'withdrawn'
                  ? <button type="button" className="restore-student" disabled={Boolean(savingField)} onClick={() => setEnrollmentStatus(selectedStudent, false)}>在籍中へ戻す</button>
                  : <button type="button" className="withdraw-student" disabled={Boolean(savingField)} onClick={() => setEnrollmentStatus(selectedStudent, true)}>退塾にする</button>}
              </section>
            </>
          )}
        </aside>
      </section>
      </>}

    </main>
  );
}
