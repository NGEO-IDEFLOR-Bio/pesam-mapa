/**
 * KML Parser for Leaflet - Fixed version
 * Properly parses KML files and creates Leaflet layers
 */
L.KML = L.FeatureGroup.extend({
    options: {
        async: true
    },

    initialize: function(kml, options) {
        L.FeatureGroup.prototype.initialize.call(this, []);
        L.Util.setOptions(this, options);

        if (typeof kml === 'string') {
            var parser = new DOMParser();
            kml = parser.parseFromString(kml, 'text/xml');
        }
        this._kml = kml;
        this._styles = {};
        this.parseKML();
    },

    parseKML: function() {
        var kmlDoc = this._kml;

        // Parse Styles first
        var styles = kmlDoc.getElementsByTagName('Style');
        for (var s = 0; s < styles.length; s++) {
            this._parseStyle(styles[s]);
        }

        // Parse Document level
        var docs = kmlDoc.getElementsByTagName('Document');
        if (docs.length > 0) {
            this._parseContainer(docs[0]);
        }

        // Parse top-level Folders
        var folders = kmlDoc.getElementsByTagName('Folder');
        for (var f = 0; f < folders.length; f++) {
            // Only parse top-level folders (no parent Folder)
            var parent = folders[f].parentNode;
            if (parent && parent.tagName === 'Document') {
                this._parseContainer(folders[f]);
            } else if (parent && parent.tagName === 'kml') {
                this._parseContainer(folders[f]);
            }
        }

        // Parse top-level Placemarks (not inside Folder)
        var placemarks = kmlDoc.getElementsByTagName('Placemark');
        for (var p = 0; p < placemarks.length; p++) {
            // Only parse if direct child of Document or kml
            var pn = placemarks[p].parentNode;
            if (pn && (pn.tagName === 'Document' || pn.tagName === 'kml')) {
                this._parsePlacemark(placemarks[p]);
            }
        }

        // Fire dataloaded event
        this.fire('dataloaded');
    },

    _parseContainer: function(container) {
        var placemarks = container.getElementsByTagName('Placemark');
        for (var i = 0; i < placemarks.length; i++) {
            // Only direct children
            if (placemarks[i].parentNode === container) {
                this._parsePlacemark(placemarks[i]);
            }
        }

        var folders = container.getElementsByTagName('Folder');
        for (var j = 0; j < folders.length; j++) {
            if (folders[j].parentNode === container) {
                this._parseContainer(folders[j]);
            }
        }
    },

    _parsePlacemark: function(placemark) {
        var name = this._getTextContent(placemark, 'name') || '';
        var description = this._getTextContent(placemark, 'description') || '';

        // Try ExtendedData for name/description
        if (!name) {
            var sd = placemark.getElementsByTagName('SimpleData');
            for (var i = 0; i < sd.length; i++) {
                var attrName = sd[i].getAttribute('name');
                if (attrName === 'nome_' || attrName === 'ZONA' || attrName === 'SIGLA') {
                    name = sd[i].textContent.trim();
                }
            }
        }

        // Get geometry
        var point = placemark.getElementsByTagName('Point')[0];
        var lineString = placemark.getElementsByTagName('LineString')[0];
        var polygon = placemark.getElementsByTagName('Polygon')[0];
        var multiGeometry = placemark.getElementsByTagName('MultiGeometry')[0];

        var layer = null;

        if (point) {
            var coords = this._parseCoordinates(point);
            if (coords.length > 0) {
                layer = L.marker([coords[0].lat, coords[0].lng], { title: name });
                name = name || 'Ponto';
                layer.bindPopup(this._createPopup(name, description, placemark));
            }
        } else if (polygon) {
            layer = this._parsePolygon(polygon, name, description, placemark);
        } else if (lineString) {
            var lineCoords = this._parseCoordinates(lineString);
            if (lineCoords.length > 0) {
                var latlngs = lineCoords.map(function(c) { return [c.lat, c.lng]; });
                layer = L.polyline(latlngs, { title: name, weight: 3 });
                layer.bindPopup(this._createPopup(name, description, placemark));
            }
        } else if (multiGeometry) {
            var polygons = multiGeometry.getElementsByTagName('Polygon');
            var lines = multiGeometry.getElementsByTagName('LineString');
            var points = multiGeometry.getElementsByTagName('Point');

            if (polygons.length > 0) {
                var multiLatlngs = [];
                for (var pi = 0; pi < polygons.length; pi++) {
                    var ring = this._parsePolygonRing(polygons[pi]);
                    if (ring.length > 0) multiLatlngs.push(ring);
                }
                if (multiLatlngs.length > 0) {
                    layer = L.polygon(multiLatlngs, { title: name });
                    layer.bindPopup(this._createPopup(name, description, placemark));
                }
            } else if (lines.length > 0) {
                var multiLineCoords = [];
                for (var li = 0; li < lines.length; li++) {
                    var lc = this._parseCoordinates(lines[li]);
                    if (lc.length > 0) {
                        multiLineCoords.push(lc.map(function(c) { return [c.lat, c.lng]; }));
                    }
                }
                if (multiLineCoords.length > 0) {
                    layer = L.polyline(multiLineCoords, { title: name, weight: 3 });
                    layer.bindPopup(this._createPopup(name, description, placemark));
                }
            } else if (points.length > 0) {
                // Multiple points as a feature group
                layer = L.featureGroup();
                for (var mi = 0; mi < points.length; mi++) {
                    var mc = this._parseCoordinates(points[mi]);
                    if (mc.length > 0) {
                        var m = L.marker([mc[0].lat, mc[0].lng], { title: name });
                        m.bindPopup(this._createPopup(name, description, placemark));
                        layer.addLayer(m);
                    }
                }
            }
        }

        if (layer) {
            this.addLayer(layer);
        }
    },

    _parsePolygon: function(polygon, name, description, placemark) {
        var outerBoundary = polygon.getElementsByTagName('outerBoundaryIs')[0];
        if (!outerBoundary) return null;

        var outerRing = outerBoundary.getElementsByTagName('LinearRing')[0];
        if (!outerRing) return null;

        var coords = this._parseCoordinates(outerRing);
        if (coords.length === 0) return null;

        var latlngs = coords.map(function(c) { return [c.lat, c.lng]; });
        var layer = L.polygon(latlngs, { title: name });
        layer.bindPopup(this._createPopup(name, description, placemark));

        return layer;
    },

    _parsePolygonRing: function(polygon) {
        var outerBoundary = polygon.getElementsByTagName('outerBoundaryIs')[0];
        if (!outerBoundary) return [];

        var ring = outerBoundary.getElementsByTagName('LinearRing')[0];
        if (!ring) return [];

        var coords = this._parseCoordinates(ring);
        return coords.map(function(c) { return [c.lat, c.lng]; });
    },

    _parseCoordinates: function(element) {
        var coords = [];
        var coordElements = element.getElementsByTagName('coordinates');
        if (coordElements.length === 0) return coords;

        var coordText = coordElements[0].textContent.trim();
        // KML coordinates: longitude,latitude,altitude separated by spaces or newlines
        var parts = coordText.split(/[\s\n]+/);

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part) continue;

            var values = part.split(',');
            if (values.length >= 2) {
                var lng = parseFloat(values[0]);
                var lat = parseFloat(values[1]);
                var alt = values.length > 2 ? parseFloat(values[2]) : 0;

                if (!isNaN(lng) && !isNaN(lat)) {
                    coords.push({ lng: lng, lat: lat, alt: alt });
                }
            }
        }

        return coords;
    },

    _getTextContent: function(element, tagName) {
        var elements = element.getElementsByTagName(tagName);
        return elements.length > 0 ? elements[0].textContent.trim() : '';
    },

    _createPopup: function(name, description, placemark) {
        var html = '<div class="kml-popup">';
        html += '<h4>' + (name || 'Feature') + '</h4>';
        if (description) {
            html += '<p>' + description + '</p>';
        }

        // Add ExtendedData
        var simpleData = placemark.getElementsByTagName('SimpleData');
        if (simpleData.length > 0) {
            html += '<table class="kml-popup-table">';
            for (var i = 0; i < simpleData.length; i++) {
                var attrName = simpleData[i].getAttribute('name');
                var attrValue = simpleData[i].textContent.trim();
                if (attrName && attrValue) {
                    html += '<tr><td><strong>' + attrName + '</strong></td><td>' + attrValue + '</td></tr>';
                }
            }
            html += '</table>';
        }

        html += '</div>';
        return html;
    },

    _parseStyle: function(style) {
        var styleId = style.getAttribute('id');
        if (styleId) {
            this._styles['#' + styleId] = style;
        }
    }
});

L.kml = function(kml, options) {
    return new L.KML(kml, options);
};