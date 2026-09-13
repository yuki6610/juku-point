export const calculateSummary = (records, year, term) => {
  const summary = {
    homework: { submitted: 0, partial: 0, missed: 0, none: 0, notEvaluated: 0 },
    attendance: { ontime: 0, late: 0, absent: 0, makeup: 0 },
    wordTest: {
      completed: 0,
      pending: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      averageRate: 0,
    },
    forgot: 0,
    lessonCount: 0,
  };

  records.forEach((record) => {
    const attended = record.attendance === "present" || record.attendance === "makeup";

    if (record.attendance === "absent") summary.attendance.absent += 1;
    if (record.attendance === "makeup") summary.attendance.makeup += 1;
    if (attended) {
      summary.lessonCount += 1;
      if (record.late) summary.attendance.late += 1;
      else summary.attendance.ontime += 1;
      if (record.forgot) summary.forgot += 1;
    }

    if (record.homework === "submitted") summary.homework.submitted += 1;
    else if (record.homework === "partial") summary.homework.partial += 1;
    else if (record.homework === "missed") summary.homework.missed += 1;
    else if (record.homework === "none") summary.homework.none += 1;
    else summary.homework.notEvaluated += 1;

    if (record.wordTest?.status === "completed" || record.wordTest?.status === "makeup") {
      summary.wordTest.completed += 1;
      summary.wordTest.totalCorrect += Number(record.wordTest.correct || 0);
      summary.wordTest.totalQuestions += Number(record.wordTest.total || 0);
    } else if (record.wordTest?.status === "pending") {
      summary.wordTest.pending += 1;
    }
  });

  summary.wordTest.averageRate =
    summary.wordTest.totalQuestions > 0
      ? Math.round(
          (summary.wordTest.totalCorrect / summary.wordTest.totalQuestions) * 1000
        ) / 10
      : 0;

  const homeworkTotal =
    summary.homework.submitted + summary.homework.partial + summary.homework.missed;
  const attendanceTotal = summary.attendance.ontime + summary.attendance.late;
  const homeworkRate =
    homeworkTotal > 0
      ? (summary.homework.submitted + summary.homework.partial * 0.5) / homeworkTotal
      : 1;
  const attendanceRate =
    attendanceTotal > 0 ? summary.attendance.ontime / attendanceTotal : 1;

  summary.behaviorScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        homeworkRate * 40 +
          attendanceRate * 40 +
          20 -
          summary.attendance.late * 5 -
          summary.forgot * 4
      )
    )
  );
  summary.year = String(year);
  summary.term = `${term}学期`;
  return summary;
};
