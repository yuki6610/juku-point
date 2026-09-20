export const activeStudents = (students = []) => students.filter((student) =>
  student?.active !== false && student?.enrollmentStatus !== 'withdrawn'
)

export const availableStudentGrades = (students = []) => [...new Set(
  activeStudents(students)
    .map((student) => Number(student?.grade))
    .filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 12)
)].sort((a, b) => a - b)
