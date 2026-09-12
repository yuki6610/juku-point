import LessonAttendanceManager from './LessonAttendanceManager';
export default function Page() {
  return <>
    <p style={{ padding: '16px 24px' }}>学習記録・出欠の統合画面は <a href="/admin/lesson-records">こちら</a>。通塾曜日・学期・年間授業日は <a href="/admin/settings">管理者設定</a>へ移動しました。</p>
    <LessonAttendanceManager recordsOnly />
  </>;
}
