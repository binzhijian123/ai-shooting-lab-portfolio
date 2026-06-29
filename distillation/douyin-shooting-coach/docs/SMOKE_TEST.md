# Smoke Test

## Test Case

User uploads five front-view shooting clips. Most shots miss to the right. The app observes:

- The elbow opens slightly outward before release.
- The wrist follow-through moves to the right.
- The miss direction repeats across several attempts.

## Required Answer Structure

1. Restate the observed problem.
2. List evidence signals from frames or clips.
3. Classify the most likely error type.
4. Name at least one false positive to rule out.
5. Provide two repair drills.
6. Define the next retest metric.

## Expected Diagnosis Pattern

- Likely module: `shot_diagnosis`.
- Likely motion focus: elbow line, wrist direction, release path.
- Likely error: release line is not aligned with target line.
- False positives: one-off fatigue, camera angle distortion, defensive pressure, ball grip issue.
- Retest metric: percentage of attempts where elbow, wrist, and ball path stay on the target line.

