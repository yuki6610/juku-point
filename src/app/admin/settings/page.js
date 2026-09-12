import LessonAttendanceManager from '../lesson-attendance/LessonAttendanceManager';
import HomeworkTemplates from './HomeworkTemplates';
import TeacherManager from './TeacherManager';
import ParentManager from './ParentManager';

export default function AdminSettingsPage() {
  return <><LessonAttendanceManager settingsOnly /><HomeworkTemplates /><TeacherManager /><ParentManager /></>;
}
