import json, math
import searoute as sr

pairs = json.load(open('pairs.json'))

def simplify(coords, max_pts=28):
    # coords: list of [lng,lat]. Keep endpoints, downsample the middle evenly.
    if len(coords) <= max_pts: return coords
    keep = [coords[0]]
    step = (len(coords)-1)/(max_pts-1)
    for i in range(1, max_pts-1):
        keep.append(coords[round(i*step)])
    keep.append(coords[-1])
    return keep

lanes = {}
fails = []
for p in pairs:
    try:
        route = sr.searoute(p['pol'], p['pod'], append_orig_dest=True)
        coords = route['geometry']['coordinates']
        # searoute can emit antimeridian jumps as raw lng; normalise to keep the
        # polyline continuous across the Pacific (lng can exceed 180 or drop below -180).
        fixed = []
        prev = None
        for lng, lat in coords:
            if prev is not None:
                while lng - prev > 180: lng -= 360
                while lng - prev < -180: lng += 360
            fixed.append([round(lng,3), round(lat,3)])
            prev = lng
        # snap exact endpoints to the port coords
        fixed[0] = [round(p['pol'][0],3), round(p['pol'][1],3)]
        fixed[-1] = [round(p['pod'][0],3), round(p['pod'][1],3)]
        s = simplify(fixed)
        lanes[p['key']] = {'pts': s, 'km': round(route['properties']['length'])}
    except Exception as e:
        fails.append((p['key'], str(e)[:60]))

print('lanes:', len(lanes), 'fails:', len(fails))
for f in fails[:20]: print('  FAIL', f)
# sanity: report longest/shortest
lens = sorted(((v['km'],k) for k,v in lanes.items()))
print('shortest', lens[:3])
print('longest', lens[-3:])
json.dump(lanes, open('lanes.json','w'))
