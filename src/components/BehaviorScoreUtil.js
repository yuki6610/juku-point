export const calcBehaviorScore = summary => {
  if (!summary) return 0
  return (
    (summary.homework?.submitted||0)*2 +
    (summary.homework?.partial||0) -
    (summary.homework?.missed||0)*2 +
    (summary.attendance?.ontime||0) -
    (summary.attendance?.late||0) -
    (summary.forgot||0)
  )
}
