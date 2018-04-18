var bigInteger = require('big-integer')

var ID_BYTES = 16
var ID_BASE = 16
var ID_ENCODING = 'hex'
var ID_MAX = bigInteger(2).pow(ID_BYTES * 8).minus(1)

module.exports.ID_BYTES = ID_BYTES
module.exports.ID_BASE = ID_BASE
module.exports.ID_ENCODING = ID_ENCODING
module.exports.ID_MAX = ID_MAX
module.exports.distance = distance
module.exports.distanceComparator = distanceComparator

/* Calculates the distance between two IDs
 *
 * The IDs form a circular ring where id:0x0001 comes after id:0x0000
 * and id:0xFFFF comes before id:0x0000.
 *
 * Calculating the distance requires calculating the clockwise and
 * couter-clockwise distance in order to find the shorter one.
 *
 * A negative distance indicates that idA is to the left (counter-clockwise)
 * to idB and vice versa for a postive distance
 */
function distance (idA, idB) {
  idA = bigInteger(idA, ID_BASE)
  idB = bigInteger(idB, ID_BASE)

  // Distance from idB to idA
  var dist1 = idB.minus(idA)

  // Distance from idB to idA going all the around the id space
  var dist2 = idA.greater(idB)
    ? ID_MAX.minus(idA).plus(idB).plus(bigInteger(1))
    : ID_MAX.minus(idB).plus(idA).plus(bigInteger(1)).times(bigInteger(-1))

  // Return the shortest distance
  return dist1.abs().lesser(dist2.abs()) ? dist1 : dist2
}

// Compares idA/B's absolute distance to the targetID
function distanceComparator (targetID, idA, idB) {
  var distA = distance(targetID, idA)
  var distB = distance(targetID, idB)

  return distA.compareAbs(distB)
}
