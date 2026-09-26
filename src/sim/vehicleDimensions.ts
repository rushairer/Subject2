export const TRAINING_CAR = {
  lengthMeters: 4.4,
  widthMeters: 1.8,
  wheelbaseMeters: 2.82,
  trackWidthMeters: 1.56,
  frontAxleFromCenterMeters: 1.41,
  rearAxleFromCenterMeters: 1.41,
  wheelRadiusMeters: 0.31,
  // Matches the rendered training-car tire tread width.
  tireWidthMeters: 0.19,
  // Finite ground-contact patch used by line-contact judging.
  tireContactPatchLengthMeters: 0.16,
} as const
