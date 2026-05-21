# PESAM - Mapa Interativo do Parque Estadual Serra dos Martírios/Andorinhas

Aplicação web de mapeamento interativo para visualização e análise dos dados geoespaciais do Parque Estadual Serra dos Martírios/Andorinhas (PESAM), localizado no município de São Geraldo do Araguaia, Pará.

## Funcionalidades

- **Mapas Base**: Alternância entre OpenStreetMap, Bing Satellite, ESRI Satellite, Google Satellite, CartoDB Voyager e Sentinel-2 2024
- **Camadas de Dados**:
  - Limite do PESAM
  - Zoneamento (Zona de Conservação e Zona de Uso Divergente)
  - Fazenda Água Azul
  - Área de Invasão
  - Pontos de Campo
  - Fotos de Campo com geolocalização
- **Exportação**: Download de arquivos KML
- **Ferramentas**: Zoom, navegação, medição de distância, cópia de coordenadas
- **Design Responsivo**: Adaptado para desktop e dispositivos móveis

## Tecnologias

- Leaflet.js para mapeamento
- OpenStreetMap, Bing, ESRI, Google, CARTO e Sentinel-2 como fontes de mapas base
- HTML5, CSS3, JavaScript ES6+
- Font Awesome para ícones
- Google Fonts (Inter, JetBrains Mono)

## Estrutura de Arquivos

```
projeto_mapa/
├── index.html          # Página principal
├── css/
│   └── style.css       # Estilos da aplicação
├── js/
│   └── app.js          # Lógica da aplicação
├── data/
│   ├── PESAM.kml               # Limite do Parque
│   ├── zoneamento_PESAM.kml    # Zoneamento
│   ├── Fazenda_Agua_Azul_Simbologia.kml  # Fazenda
│   └── pontos.kml              # Pontos de referência
└── images/                      # Fotos de campo
```

## Hospedagem

Este projeto é compatível com GitHub Pages. Para publicar:

1. Fork este repositório
2. Habilite GitHub Pages nas configurações
3. Acesse `https://seu-usuario.github.io/nome-do-repo/`

## Dados

Instituto de Desenvolvimento Florestal e da Biodiversidade do Estado do Pará - IDEFLOR-Bio

Dados públicos sob Creative Commons CC BY 4.0

## Licença

Creative Commons Attribution 4.0 International (CC BY 4.0)