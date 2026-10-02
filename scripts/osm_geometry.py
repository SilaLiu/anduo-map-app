"""Assemble OSM boundary ways by shared endpoints, without inventing edges."""


def assemble_rings(segments):
    pending = [list(segment) for segment in segments]
    if any(len(segment) < 2 for segment in pending):
        raise ValueError('Boundary way has fewer than two points')
    rings = []
    while pending:
        ring = pending.pop(0)
        while ring[0] != ring[-1]:
            candidates = [(i, segment) for i, segment in enumerate(pending)
                          if ring[-1] in (segment[0], segment[-1])]
            if len(candidates) != 1:
                raise ValueError('Boundary ways are disconnected or branch at an endpoint')
            index, segment = candidates[0]
            pending.pop(index)
            if segment[-1] == ring[-1]:
                segment = list(reversed(segment))
            ring.extend(segment[1:])
        if len(set(map(tuple, ring))) < 3:
            raise ValueError('Boundary ring has fewer than three distinct points')
        rings.append(ring)
    return rings


def point_in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def ring_area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:])))


def boundary_geometry(outer_segments, inner_segments=()):
    outer_rings = assemble_rings(outer_segments)
    if not outer_rings:
        raise ValueError('Boundary has no exterior rings')
    polygons = [[ring] for ring in outer_rings]
    for hole in assemble_rings(inner_segments):
        containing = [i for i, outer in enumerate(outer_rings) if point_in_ring(hole[0], outer)]
        if not containing:
            raise ValueError('Boundary interior ring is outside every exterior ring')
        index = min(containing, key=lambda i: ring_area(outer_rings[i]))
        polygons[index].append(hole)
    if len(polygons) == 1:
        return {'type': 'Polygon', 'coordinates': polygons[0]}
    return {'type': 'MultiPolygon', 'coordinates': polygons}


def relation_to_geometry(relation, nodes, ways):
    segments = {'outer': [], 'inner': []}
    for member in relation.get('members', []):
        role = member.get('role', '')
        if member.get('type') != 'way' or role not in segments:
            continue
        node_ids = ways.get(member['ref'])
        if not node_ids or any(node_id not in nodes for node_id in node_ids):
            raise ValueError(f"Missing way or nodes: {member['ref']}")
        segments[role].append([list(nodes[node_id]) for node_id in node_ids])
    return boundary_geometry(segments['outer'], segments['inner'])
