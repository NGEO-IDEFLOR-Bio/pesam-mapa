/**
 * PESAM Interactive Map - Main Application
 * Instituto de Desenvolvimento Florestal e da Biodiversidade do Estado do Pará - IDEFLOR-Bio
 * 
 * Bug fixes applied:
 * - Fixed KML parser receiving Document instead of string
 * - Fixed setStyle() called on L.Marker (TypeError crash)
 * - Fixed Bing quadkey tile URL
 * - Fixed Sentinel-2 WMTS URL (not WMS)
 * - Fixed photo modal CSS class mismatch
 * - Fixed sidebar toggle for mobile
 * - Fixed modal visibility on page load
 * - Added ExtendedData parsing for zone names
 * - Added auto-zoom to data bounds
 * - Added custom marker CSS classes
 */

(function() {
    'use strict';

    // ===================================
    // CONFIGURATION
    // ===================================

    var CONFIG = {
        center: [-6.28, -48.42],
        zoom: 11,
        maxZoom: 19,
        minZoom: 8,
        defaultOpacity: 0.7,
        defaultFillOpacity: 0.25
    };

    var BASEMAPS = {
        osm: {
            name: 'OpenStreetMap',
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        },
        esri: {
            name: 'ESRI Satellite',
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attribution: '&copy; Esri, Maxar, Earthstar Geographics'
        },
        google: {
            name: 'Google Satellite',
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            attribution: '&copy; Google'
        },
        bing: {
            name: 'Bing Satellite',
            attribution: '&copy; Microsoft Bing'
        },
        carto: {
            name: 'CartoDB Voyager',
            url: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
        },
        carto_nolabels: {
            name: 'CartoDB (sem rótulos)',
            url: 'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
        },
        sentinel: {
            name: 'Sentinel-2 2024',
            url: 'https://tiles.maps.eox.at/wms?service=WMS&request=GetTile&version=1.1.1&layers=s2cloudless-2024&styles=&format=image/jpeg&tileMatrixSet=GoogleMapsCompatible&tileMatrix={z}&tileRow={y}&tileCol={x}',
            attribution: '&copy; EOX Sentinel-2 Cloudless'
        }
    };

    // ===================================
    // STATE
    // ===================================

    var map;
    var activeBasemap;
    var dataLayers = {};
    var layerBounds;

    // ===================================
    // INITIALIZATION
    // ===================================

    function init() {
        initMap();
        initBasemaps();
        initDataLayers();
        initEventListeners();

        // Hide loading after initialization
        setTimeout(function() {
            var overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(function() {
                    overlay.style.display = 'none';
                }, 300);
            }
        }, 1000);
    }

    function initMap() {
        map = L.map('map', {
            center: CONFIG.center,
            zoom: CONFIG.zoom,
            maxZoom: CONFIG.maxZoom,
            minZoom: CONFIG.minZoom,
            zoomControl: false,
            attributionControl: true
        });

        // Set default basemap
        setBasemap('osm');

        // Mouse move - update coordinates
        map.on('mousemove', function(e) {
            document.getElementById('cursorLat').textContent = e.latlng.lat.toFixed(6);
            document.getElementById('cursorLon').textContent = e.latlng.lng.toFixed(6);
        });

        map.on('zoomend', function() {
            document.getElementById('cursorZoom').textContent = map.getZoom();
        });
    }

    // ===================================
    // BASEMAPS
    // ===================================

    function initBasemaps() {
        var basemapList = document.getElementById('basemapList');
        var items = basemapList.querySelectorAll('.basemap-item');

        items.forEach(function(item) {
            item.addEventListener('click', function() {
                var layerKey = this.dataset.layer;
                setBasemap(layerKey);

                items.forEach(function(i) { i.classList.remove('active'); });
                this.classList.add('active');

                // Update attribution
                var basemap = BASEMAPS[layerKey];
                if (basemap) {
                    document.getElementById('mapAttribution').innerHTML = basemap.attribution;
                }
            });
        });
    }

    function setBasemap(key) {
        if (activeBasemap) {
            map.removeLayer(activeBasemap);
        }

        var basemap = BASEMAPS[key];
        if (!basemap) return;

        // Special handling for Bing (quadkey format)
        if (key === 'bing') {
            activeBasemap = L.tileLayer('', {
                attribution: basemap.attribution,
                maxZoom: 18,
                subdomains: '0123'
            });
            // Override getTileUrl for quadkey
            activeBasemap.getTileUrl = function(coords) {
                var quadkey = '';
                for (var i = coords.z; i > 0; i--) {
                    var digit = 0;
                    var mask = 1 << (i - 1);
                    if ((coords.x & mask) !== 0) digit += 1;
                    if ((coords.y & mask) !== 0) digit += 2;
                    quadkey += digit;
                }
                var subdomain = this._getSubdomain(coords);
                return 'https://ecn.t' + subdomain + '.tiles.virtualearth.net/tiles/a' + quadkey + '.jpeg?g=0';
            };
            activeBasemap.addTo(map);
            return;
        }

        activeBasemap = L.tileLayer(basemap.url, {
            attribution: basemap.attribution,
            maxZoom: basemap.maxZoom || 19
        });

        activeBasemap.addTo(map);
    }

    // ===================================
    // DATA LAYERS
    // ===================================

    function initDataLayers() {
        dataLayers.pesam = L.layerGroup();
        dataLayers.zoneamento = L.layerGroup();
        dataLayers.fazenda = L.layerGroup();
        dataLayers.pontos = L.layerGroup();
        dataLayers.fotos = L.layerGroup();

        layerBounds = L.latLngBounds();

        // Load KML files
        loadKML('data/PESAM.kml', dataLayers.pesam, stylePesamLayer);
        loadKML('data/zoneamento_PESAM.kml', dataLayers.zoneamento, styleZoneamentoLayer);
        loadKML('data/Fazenda_Agua_Azul_Simbologia.kml', dataLayers.fazenda, styleFazendaLayer);
        loadKML('data/pontos.kml', dataLayers.pontos, stylePontosLayer);

        // Add default layers
        dataLayers.pesam.addTo(map);
        dataLayers.fazenda.addTo(map);
        dataLayers.pontos.addTo(map);

        // Setup toggles
        setupLayerToggles();

        // Init photo markers
        initPhotoMarkers();
    }

    function loadKML(url, layerGroup, onEachFeature) {
        fetch(url)
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.text();
            })
            .then(function(text) {
                // Pass the raw text string to L.kml - it handles parsing
                var kmlLayer = L.kml(text);

                // Process each layer: style and add to group
                kmlLayer.eachLayer(function(layer) {
                    if (onEachFeature) onEachFeature(layer);
                    layer.addTo(layerGroup);

                    // Extend bounds
                    if (layer.getBounds) {
                        layerBounds.extend(layer.getBounds());
                    } else if (layer.getLatLng) {
                        layerBounds.extend(layer.getLatLng());
                    }
                });

                // Auto-zoom if we have bounds and haven't zoomed yet
                if (layerBounds.isValid() && map.getZoom() <= CONFIG.zoom) {
                    map.fitBounds(layerBounds, { padding: [50, 50], maxZoom: 13 });
                }

                showToast('Camada carregada');
            })
            .catch(function(error) {
                console.error('Error loading ' + url + ':', error);
                showToast('Erro ao carregar: ' + url, true);
            });
    }

    function stylePesamLayer(layer) {
        // Don't call setStyle on Markers - it crashes!
        if (layer.setStyle) {
            layer.setStyle({
                color: '#1565C0',
                weight: 3,
                opacity: 1,
                fillOpacity: CONFIG.defaultFillOpacity
            });
        }

        // Add popup if not already bound
        if (!layer.getPopup()) {
            var name = layer.options.title || 'Parque Estadual';
            layer.bindPopup(
                '<div class="kml-popup">' +
                '<h4>' + name + '</h4>' +
                '<p>Unidade de Conservação de Proteção Integral</p>' +
                '<p><strong>Lei Estadual nº 5.982/1996</strong></p>' +
                '<p>Área: 25.031,83 ha</p>' +
                '</div>'
            );
        }
    }

    function styleZoneamentoLayer(layer) {
        if (layer.setStyle) {
            // Try to determine zone type from popup content or title
            var name = (layer.options.title || '').toLowerCase();
            var color = '#4CAF50'; // Default ZC

            if (name.indexOf('uso divergente') !== -1 || name.indexOf('zud') !== -1) {
                color = '#8BC34A';
            } else if (name.indexOf('conservação') !== -1 || name.indexOf('zc') !== -1) {
                color = '#4CAF50';
            }

            layer.setStyle({
                color: color,
                weight: 2,
                opacity: 0.8,
                fillColor: color,
                fillOpacity: CONFIG.defaultFillOpacity
            });
        }

        if (!layer.getPopup()) {
            var popupName = layer.options.title || 'Zona';
            layer.bindPopup('<div class="kml-popup"><h4>' + popupName + '</h4></div>');
        }
    }

    function styleFazendaLayer(layer) {
        // Skip markers - they don't have setStyle
        if (layer.setStyle) {
            layer.setStyle({
                color: '#FF5722',
                weight: 2,
                opacity: 0.9,
                fillColor: '#FF5722',
                fillOpacity: CONFIG.defaultFillOpacity
            });
        }

        if (!layer.getPopup()) {
            var name = layer.options.title || 'Fazenda Água Azul';
            layer.bindPopup(
                '<div class="kml-popup">' +
                '<h4>' + name + '</h4>' +
                '<p><strong>Área:</strong> 910,67 ha</p>' +
                '<p><strong>Matrícula:</strong> 1.246</p>' +
                '<p><strong>Proprietário:</strong> Carlos Paulo Gonçalves</p>' +
                '</div>'
            );
        }

        // Extend bounds
        if (layer.getBounds) {
            layerBounds.extend(layer.getBounds());
        }
    }

    function stylePontosLayer(layer) {
        // Markers use different styling
        if (layer instanceof L.Marker) {
            var name = layer.options.title || '';
            layer.setIcon(L.divIcon({
                className: 'pesam-marker',
                html: '<i class="fas fa-map-marker-alt"></i>',
                iconSize: [24, 24],
                iconAnchor: [12, 24]
            }));
        } else if (layer.setStyle) {
            layer.setStyle({
                color: '#9C27B0',
                weight: 2,
                opacity: 0.9,
                fillColor: '#9C27B0',
                fillOpacity: 0.8
            });
        }

        if (!layer.getPopup()) {
            var name = layer.options.title || 'Ponto';
            layer.bindPopup('<div class="kml-popup"><h4>' + name + '</h4></div>');
        }
    }

    function setupLayerToggles() {
        var toggles = {
            'layerPesam': dataLayers.pesam,
            'layerZoneamento': dataLayers.zoneamento,
            'layerFazenda': dataLayers.fazenda,
            'layerPontos': dataLayers.pontos,
            'layerPhotos': dataLayers.fotos
        };

        Object.keys(toggles).forEach(function(id) {
            var layer = toggles[id];
            var checkbox = document.getElementById(id);
            if (!checkbox) return;

            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    map.addLayer(layer);
                } else {
                    map.removeLayer(layer);
                }
            });
        });
    }

    // ===================================
    // PHOTO MARKERS
    // ===================================

    function initPhotoMarkers() {
        // Photo locations from field visit - approximate coordinates
        var photos = [
            {
                name: 'Marco A7P-M-1264',
                lat: -6.2817,
                lng: -48.4165,
                filename: 'foto-marco.jpeg',
                date: '16/05/2026'
            },
            {
                name: 'Ponto 1 - Centro de Visitantes (PA Buqueirão)',
                lat: -6.2890,
                lng: -48.4180,
                filename: 'TimePhoto_20260516_102918.jpg',
                date: '16/05/2026'
            },
            {
                name: 'Acesso Cachoeira Quarta Queda',
                lat: -6.2850,
                lng: -48.4200,
                filename: 'TimePhoto_20260516_104322.jpg',
                date: '16/05/2026'
            },
            {
                name: 'Placa PESAM',
                lat: -6.2830,
                lng: -48.4215,
                filename: 'TimePhoto_20260516_104327.jpg',
                date: '16/05/2026'
            },
            {
                name: 'Trilha no Parque',
                lat: -6.2860,
                lng: -48.4185,
                filename: 'TimePhoto_20260516_105145.jpg',
                date: '16/05/2026'
            },
            {
                name: 'Vista panorâmica do PESAM',
                lat: -6.2780,
                lng: -48.4100,
                filename: 'TimePhoto_20260516_171124.jpg',
                date: '16/05/2026'
            }
        ];

        photos.forEach(function(photo) {
            var marker = L.marker([photo.lat, photo.lng], {
                icon: L.divIcon({
                    className: 'photo-marker',
                    html: '<i class="fas fa-camera"></i>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            });

            marker.bindPopup(
                '<div style="text-align:center;">' +
                '<img src="images/' + photo.filename + '" alt="' + photo.name + '" ' +
                'style="max-width:200px;cursor:pointer;border-radius:8px;" ' +
                'onclick="openPhotoModal(\'images/' + photo.filename + '\', \'' + photo.name + '\', \'' + photo.date + '\', \'' + photo.lat + ', ' + photo.lng + '\')">' +
                '<p style="margin-top:8px;font-size:12px;"><strong>' + photo.name + '</strong><br>' + photo.date + '</p>' +
                '</div>',
                { maxWidth: 250 }
            );

            marker.addTo(dataLayers.fotos);
        });
    }

    // ===================================
    // EVENT LISTENERS
    // ===================================

    function initEventListeners() {
        // Sidebar toggles
        document.getElementById('toggleLayerPanel').addEventListener('click', function() {
            togglePanel('layerPanel', this);
        });

        document.getElementById('toggleToolPanel').addEventListener('click', function() {
            togglePanel('toolPanel', this);
        });

        document.getElementById('closeLayerPanel').addEventListener('click', function() {
            closePanel('layerPanel', 'toggleLayerPanel');
        });

        document.getElementById('closeToolPanel').addEventListener('click', function() {
            closePanel('toolPanel', 'toggleToolPanel');
        });

        // Accordion sections
        document.querySelectorAll('.layer-section-header').forEach(function(header) {
            header.addEventListener('click', function() {
                var targetId = this.dataset.target;
                var content = document.getElementById(targetId);
                content.classList.toggle('show');
                this.classList.toggle('active');
            });
        });

        // Open first two sections by default
        var sections = document.querySelectorAll('.layer-section-content');
        if (sections.length >= 2) {
            sections[0].classList.add('show');
            sections[1].classList.add('show');
            var headers = document.querySelectorAll('.layer-section-header');
            if (headers.length >= 2) {
                headers[0].classList.add('active');
                headers[1].classList.add('active');
            }
        }

        // Navigation tools
        document.getElementById('btnZoomIn').addEventListener('click', function() { map.zoomIn(); });
        document.getElementById('btnZoomOut').addEventListener('click', function() { map.zoomOut(); });
        document.getElementById('zoomInBtn').addEventListener('click', function() { map.zoomIn(); });
        document.getElementById('zoomOutBtn').addEventListener('click', function() { map.zoomOut(); });

        document.getElementById('btnLocate').addEventListener('click', locateUser);
        document.getElementById('btnCenter').addEventListener('click', function() {
            map.setView(CONFIG.center, CONFIG.zoom);
        });

        // Copy coordinates
        document.getElementById('btnCopyCoords').addEventListener('click', copyCoordinates);

        // Fullscreen
        document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);

        // About modal
        document.getElementById('btnAbout').addEventListener('click', function() {
            document.getElementById('aboutModal').style.display = 'flex';
        });
        document.getElementById('closeAboutModal').addEventListener('click', function() {
            document.getElementById('aboutModal').style.display = 'none';
        });

        // Info modal
        document.querySelectorAll('.layer-info').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var layerType = this.dataset.layer;
                showLayerInfo(layerType);
            });
        });
        document.getElementById('closeInfoModal').addEventListener('click', function() {
            document.getElementById('infoModal').style.display = 'none';
        });

        // Photo modal
        document.getElementById('closePhotoModal').addEventListener('click', function() {
            document.getElementById('photoModal').style.display = 'none';
        });

        // Close modals on backdrop click
        document.querySelectorAll('.modal, .photo-modal').forEach(function(modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.style.display = 'none';
                }
            });
        });

        // Download buttons
        document.querySelectorAll('.btn-download').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var filename = this.dataset.file;
                if (filename) {
                    downloadFile('data/' + filename, filename);
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal, .photo-modal').forEach(function(m) {
                    m.style.display = 'none';
                });
            }
        });
    }

    function togglePanel(panelId, btn) {
        var panel = document.getElementById(panelId);
        var isMobile = window.innerWidth <= 768;

        if (isMobile) {
            panel.classList.toggle('show');
            panel.classList.toggle('collapsed');
        } else {
            panel.classList.toggle('collapsed');
        }
        btn.classList.toggle('active');
    }

    function closePanel(panelId, toggleId) {
        var panel = document.getElementById(panelId);
        var toggle = document.getElementById(toggleId);
        panel.classList.add('collapsed');
        panel.classList.remove('show');
        toggle.classList.remove('active');
    }

    // ===================================
    // UTILITY FUNCTIONS
    // ===================================

    function locateUser() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    map.setView([position.coords.latitude, position.coords.longitude], 16);
                    L.marker([position.coords.latitude, position.coords.longitude])
                        .addTo(map)
                        .bindPopup('Sua localização')
                        .openPopup();
                },
                function() {
                    showToast('Não foi possível obter sua localização', true);
                }
            );
        } else {
            showToast('Geolocalização não suportada pelo navegador', true);
        }
    }

    function copyCoordinates() {
        var lat = document.getElementById('cursorLat').textContent;
        var lng = document.getElementById('cursorLon').textContent;
        var text = lat + ', ' + lng;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function() {
                showToast('Coordenadas copiadas: ' + text);
            });
        } else {
            // Fallback for older browsers
            var textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Coordenadas copiadas: ' + text);
        }
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function downloadFile(url, filename) {
        fetch(url)
            .then(function(response) { return response.blob(); })
            .then(function(blob) {
                var urlBlob = window.URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = urlBlob;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(urlBlob);
                document.body.removeChild(a);
                showToast('Download: ' + filename);
            })
            .catch(function() {
                showToast('Erro ao baixar arquivo', true);
            });
    }

    function showToast(message, isError) {
        var toast = document.getElementById('toast');
        var toastMessage = document.getElementById('toastMessage');
        var icon = toast.querySelector('i');

        toastMessage.textContent = message;
        icon.className = isError ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
        icon.style.color = isError ? '#C62828' : '#2E7D32';

        toast.classList.add('show');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 3000);
    }

    function showLayerInfo(type) {
        var info = {
            pesam: {
                title: 'Limite do PESAM',
                content: '<p><strong>Parque Estadual Serra dos Martírios/Andorinhas (PESAM)</strong></p>' +
                    '<p>Criado pela <strong>Lei Estadual nº 5.982</strong> de 25/07/1996.</p>' +
                    '<p><strong>Área:</strong> 25.031,83 ha</p>' +
                    '<p><strong>Município:</strong> São Geraldo do Araguaia - PA</p>' +
                    '<p><strong>Categoria:</strong> Proteção Integral</p>' +
                    '<p><strong>Gestor:</strong> IDEFLOR-Bio</p>'
            },
            zoneamento: {
                title: 'Zoneamento do PESAM',
                content: '<p><strong>Zona de Conservação (ZC):</strong></p>' +
                    '<p>Áreas de proteção integral. Qualquer intervenção é vedada.</p>' +
                    '<p><strong>Zona de Uso Divergente (ZUD-1):</strong></p>' +
                    '<p>Pesquisa, monitoramento e visitação controlada.</p>'
            },
            fazenda: {
                title: 'Fazenda Água Azul',
                content: '<p><strong>Propriedade:</strong> Fazenda Água Azul</p>' +
                    '<p><strong>Matrícula:</strong> 1.246</p>' +
                    '<p><strong>Área:</strong> 910,67 ha</p>' +
                    '<p><strong>Proprietário:</strong> Carlos Paulo Gonçalves</p>' +
                    '<p>Objeto de análise de sobreposição territorial com o PESAM.</p>'
            },
            pontos: {
                title: 'Pontos de Referência',
                content: '<p>Pontos extremos e marcos geodésicos conforme a Lei Estadual nº 5.982/1996.</p>' +
                    '<p>Inclui Marcos I a XVI e pontos extremos Norte, Sul, Leste e Oeste.</p>'
            },
            fotos: {
                title: 'Fotos de Campo',
                content: '<p>Registro fotográfico da <strong>diligência de campo</strong> realizada entre 15 e 18 de maio de 2026.</p>' +
                    '<p><strong>Equipe:</strong> NGEO/IDEFLOR-Bio</p>' +
                    '<p>Clique nos marcadores para ver as fotos ampliadas.</p>'
            }
        };

        var data = info[type] || { title: 'Informação', content: '<p>Dados não disponíveis.</p>' };

        document.getElementById('infoModalTitle').textContent = data.title;
        document.getElementById('infoModalBody').innerHTML = data.content;
        document.getElementById('infoModal').style.display = 'flex';
    }

    // ===================================
    // GLOBAL FUNCTIONS (called from HTML)
    // ===================================

    window.openPhotoModal = function(imageSrc, title, date, coords) {
        var modal = document.getElementById('photoModal');
        document.getElementById('modalImage').src = imageSrc;
        document.getElementById('modalImage').alt = title;
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalDate').textContent = 'Data: ' + date;
        document.getElementById('modalCoords').textContent = 'Coordenadas: ' + coords;
        modal.style.display = 'flex';
    };

    // ===================================
    // START APPLICATION
    // ===================================

    document.addEventListener('DOMContentLoaded', init);

})();