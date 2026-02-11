// Variables Globales de Estado
let currentUser = null;
let materiasData = [];
let prelacionesData = [];
let historialData = [];

// -----------------------------------------------------------------------------
// 1. GESTIÓN DE AUTENTICACIÓN
// -----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    
    // Listeners de formularios
    document.getElementById('login-form').addEventListener('submit', login);
    document.getElementById('register-form').addEventListener('submit', register);
    
    // Toggle Login/Registro
    document.getElementById('go-to-register').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    });
    
    document.getElementById('go-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    });
});

async function login(e) {
    e.preventDefault();
    const cedula = document.getElementById('login-cedula').value;
    const pass = document.getElementById('login-pass').value;

    try {
        const { data, error } = await getClient()
            .from('usuarios')
            .select('*')
            .eq('cedula', cedula)
            .eq('password', pass)
            .single();

        if (error || !data) throw new Error("Credenciales inválidas");

        currentUser = data;
        loadDashboard();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
}
// Dentro de tu app.js
async function register(e) {
    e.preventDefault();
    console.log("Intentando registrar..."); // Para verificar que el botón responde

    const nombre = document.getElementById('reg-nombre').value;
    const cedula = document.getElementById('reg-cedula').value;
    const carrera = document.getElementById('reg-carrera').value;
    const password = document.getElementById('reg-pass').value;

    try {
        Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // Accedemos a la tabla 'usuarios'
        const { data, error } = await getClient()
            .from('usuarios')
            .insert([
                { 
                    nombre: nombre, 
                    cedula: cedula, 
                    carrera: carrera, 
                    password: password 
                }
            ])
            .select(); // El .select() es importante en versiones nuevas para confirmar inserción

        if (error) throw error;

        console.log("Registro exitoso:", data);
        Swal.fire('¡Éxito!', 'Usuario creado, ahora inicia sesión', 'success');
        
        // Cambiar vista al login
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';

    } catch (err) {
        console.error("Error completo:", err);
        Swal.fire('Error', `Detalle: ${err.message || 'Error desconocido'}`, 'error');
    }
}

function checkSession() {
    // Implementar persistencia si se desea (localStorage)
    // Por ahora reinicia al recargar
}

function logout() {
    currentUser = null;
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
    // Limpiar datos
    materiasData = [];
    historialData = [];
}

// -----------------------------------------------------------------------------
// 2. LÓGICA DE NEGOCIO (CARGA Y RENDERIZADO)
// -----------------------------------------------------------------------------

// Al inicio de tu app.js, junto a las otras variables globales
let eleccionesData = []; 

async function loadDashboard() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('user-name-display').innerText = currentUser.nombre;

    Swal.showLoading();
    
    try {
        // 1. Cargar Materias
        const { data: matData, error: e1 } = await getClient()
            .from('materia')
            .select('*')
            .eq('carrera', currentUser.carrera)
            .order('id_semestre', { ascending: true });
        if (e1) throw e1;
        materiasData = matData;

        // 2. Cargar Prelaciones
        const { data: prelData, error: e2 } = await getClient().from('prelaciones').select('*');
        if (e2) throw e2;
        prelacionesData = prelData;

        // 3. Cargar Elecciones de Electivas (Lo que faltaba)
        const { data: elecData, error: e3 } = await getClient()
            .from('elecciones_electivas')
            .select('*')
            .eq('id_usuario', currentUser.id_usuario);
        if (e3) throw e3;
        eleccionesData = elecData || [];

        // 4. Cargar Historial
        await refreshHistorial();

        renderMaterias();
        Swal.close();

    } catch (err) {
        console.error("Error detallado:", err);
        Swal.fire('Error', 'Error cargando datos académicos: ' + err.message, 'error');
    }
}

function calcularSemestreActual() {
    // Lógica: El semestre más alto donde el usuario tiene al menos una materia aprobada o cursando
    if (historialData.length === 0) return 1;
    
    const semestresConActividad = materiasData
        .filter(m => historialData.some(h => h.id_materia === m.id_materia))
        .map(m => m.id_semestre);
    
    return semestresConActividad.length > 0 ? Math.max(...semestresConActividad) : 1;
}

async function refreshHistorial() {
    const { data: histData } = await getClient()
        .from('historial')
        .select('*')
        .eq('id_usuario', currentUser.id_usuario);
    historialData = histData || [];
}

// Función para verificar si una materia está disponible (Prelaciones)
function checkPrelaciones(materiaId) {
    // Buscar requisitos donde id_materia (la que quiero ver) tiene prerequisitos (id_prela_a)
    // Nota: Según el código Dart, la estructura es [MateriaObjetivo, Prerequisito]
    // En SQL: id_materia (Objetivo), id_prela_a (Requisito)
    
    const requisitos = prelacionesData.filter(p => p.id_materia === materiaId);
    
    if (requisitos.length === 0) return true; // No tiene prelaciones

    // Verificar si CADA requisito está aprobado
    const todoAprobado = requisitos.every(req => {
        const estadoMateriaReq = historialData.find(h => h.id_materia === req.id_prela_a);
        return estadoMateriaReq && estadoMateriaReq.estado === 'aprobado';
    });

    return todoAprobado;
}

// Variables de estado adicionales
let electivasSeleccionadas = []; // Almacena {id_materia_padre, id_electiva}

// --- LÓGICA DE RENDERIZADO MEJORADA ---
function renderMaterias() {
    const container = document.getElementById('semestres-container');
    container.innerHTML = '';

    // Filtrar materias por semestre > 0 (materias regulares)
    const semestresRegulares = [...new Set(materiasData.filter(m => m.id_semestre > 0).map(m => m.id_semestre))];
    semestresRegulares.sort((a, b) => a - b);

    semestresRegulares.forEach(semNum => {
        const semDiv = document.createElement('div');
        semDiv.className = 'semestre-block';
        semDiv.innerHTML = `<div class="semestre-title">Semestre ${semNum}</div>`;
        
        const grid = document.createElement('div');
        grid.className = 'materia-grid';

        const materiasDelSemestre = materiasData.filter(m => m.id_semestre === semNum);

        materiasDelSemestre.forEach(mat => {
            const hist = historialData.find(h => h.id_materia === mat.id_materia);
            const estado = hist ? hist.estado : 'no cursada';
            const disponible = checkPrelaciones(mat.id_materia);
            
            const card = document.createElement('div');
            // Lógica de colores para la UI
            let claseColor = estado.replace(' ', '-');
            if (estado === 'no cursada' && mat.id_semestre < calcularSemestreActual()) {
                claseColor = 'arrastre'; // Amarillo
            }

            card.className = `materia-card ${claseColor} ${!disponible && estado === 'no cursada' ? 'bloqueada' : ''}`;
            
            // SI ES ELECTIVA (Nombre contiene "ELECTIVA")
            if (mat.nombre.toUpperCase().includes("ELECTIVA")) {
                card.innerHTML = renderCardElectiva(mat, estado, disponible);
            } else {
                card.innerHTML = `
                    <h4>${mat.nombre}</h4>
                    <div class="materia-info"><span>${mat.codigo}</span> <span>UC: ${mat.uc}</span></div>
                    <select onchange="updateMateriaStatus(${mat.id_materia}, this.value)">
                        <option value="no cursada" ${estado === 'no cursada' ? 'selected' : ''}>No Cursada</option>
                        <option value="aprobado" ${estado === 'aprobado' ? 'selected' : ''}>Aprobada</option>
                        <option value="reprobado" ${estado === 'reprobado' ? 'selected' : ''}>Reprobada</option>
                    </select>
                `;
            }
            grid.appendChild(card);
        });
        semDiv.appendChild(grid);
        container.appendChild(semDiv);
    });
}

function renderCardElectiva(matPadre, estado, disponible) {
    // Buscar si ya tiene una electiva asignada en la tabla elecciones_electivas
    const eleccion = eleccionesData.find(e => e.id_materia_padre === matPadre.id_materia);
    
    // Filtrar pool de electivas (semestre 0) que NO hayan sido elegidas en otros semestres
    const yaElegidasIds = eleccionesData.filter(e => e.id_materia_padre !== matPadre.id_materia).map(e => e.id_electiva_seleccionada);
    
    const poolElectivas = materiasData.filter(m => 
        m.id_semestre === 0 && 
        !yaElegidasIds.includes(m.id_materia) &&
        m.nombre.includes(matPadre.nombre.includes("TECNICA") ? "TÉCNICA" : "") // Filtro simple por nombre
    );

    let options = `<option value="">Seleccionar Electiva...</option>`;
    poolElectivas.forEach(e => {
        options += `<option value="${e.id_materia}" ${eleccion?.id_electiva_seleccionada === e.id_materia ? 'selected' : ''}>${e.nombre}</option>`;
    });

    return `
        <h4 style="color: var(--secondary)">${matPadre.nombre}</h4>
        <select class="electiva-selector" onchange="guardarEleccionElectiva(${matPadre.id_materia}, this.value)" ${!disponible ? 'disabled' : ''}>
            ${options}
        </select>
        <select onchange="updateMateriaStatus(${matPadre.id_materia}, this.value)" style="margin-top:5px">
            <option value="no cursada" ${estado === 'no cursada' ? 'selected' : ''}>Estado...</option>
            <option value="aprobado" ${estado === 'aprobado' ? 'selected' : ''}>Aprobada</option>
            <option value="reprobado" ${estado === 'reprobado' ? 'selected' : ''}>Reprobada</option>
        </select>
    `;
}

async function guardarEleccionElectiva(idPadre, idElectiva) {
    if(!idElectiva) return;
    try {
        const { error } = await getClient().from('elecciones_electivas').upsert({
            id_usuario: currentUser.id_usuario,
            id_materia_padre: idPadre,
            id_electiva_seleccionada: parseInt(idElectiva)
        }, { onConflict: 'id_usuario, id_materia_padre' });
        
        if(error) throw error;
        
        // Recargamos los datos de elecciones y refrescamos la UI
        const { data } = await getClient()
            .from('elecciones_electivas')
            .select('*')
            .eq('id_usuario', currentUser.id_usuario);
        eleccionesData = data || [];
        
        renderMaterias(); 
    } catch (err) {
        Swal.fire('Error', 'No se pudo guardar la electiva: ' + err.message, 'error');
    }
}

async function updateMateriaStatus(idMateria, nuevoEstado) {
    try {
        // Upsert en Supabase (Insertar o Actualizar)
        const { error } = await getClient()
            .from('historial')
            .upsert({ 
                id_usuario: currentUser.id_usuario, 
                id_materia: idMateria, 
                estado: nuevoEstado 
            }, { onConflict: 'id_usuario, id_materia' });

        if (error) throw error;

        // Actualizar datos locales y re-renderizar (para desbloquear prelaciones en cascada)
        await refreshHistorial();
        renderMaterias();

    } catch (err) {
        Swal.fire('Error', 'No se pudo actualizar: ' + err.message, 'error');
    }
}

// -----------------------------------------------------------------------------
// 3. FUNCIONALIDADES AVANZADAS (SUGERENCIA Y PDF)
// -----------------------------------------------------------------------------

function generarSugerencia() {
    // 1. OBTENER EL SEMESTRE MÁXIMO APROBADO (Lógica maxSem de Flutter)
    let maxSem = 0;
    
    // Iteramos sobre el historial para encontrar la materia aprobada con el semestre más alto
    historialData.forEach(h => {
        if (h.estado === 'aprobado') {
            const materia = materiasData.find(m => m.id_materia === h.id_materia);
            if (materia && materia.id_semestre > maxSem) {
                maxSem = parseInt(materia.id_semestre);
            }
        }
    });

    // 2. DEFINIR EL OBJETIVO (maxSem + 1)
    let objetivo = maxSem + 1;

    // 3. FILTRAR MATERIAS (Igual al .where((m) => ... ) de tu código Dart)
    const sugeridas = materiasData.filter(m => {
        // Buscamos si ya existe en el historial
        const hist = historialData.find(h => h.id_materia === m.id_materia);
        const estado = hist ? hist.estado : 'no cursada';

        // REGLAS ESTRICTAS DE TU CÓDIGO DART:
        // A) Si está aprobada, no se recomienda
        if (estado === 'aprobado') return false;
        
        // B) Excluir semestre 0 (Curso de Inducción)
        if (m.id_semestre === 0) return false;

        // C) !isBlocked: Verificar prelaciones (checkPrelaciones debe devolver true si puede verla)
        const noEstaBloqueada = checkPrelaciones(m.id_materia);
        
        // D) m['id_semestre'] <= objetivo: ESTO ES LO QUE EVITA QUE SALGAN TODAS
        return noEstaBloqueada && (parseInt(m.id_semestre) <= objetivo);
    });

    // 4. ORDENAR (Para que Arrastres y Reprobadas salgan primero como en el ListView)
    sugeridas.sort((a, b) => a.id_semestre - b.id_semestre);

    if (sugeridas.length === 0) {
        Swal.fire('Info', `No hay materias disponibles para el semestre ${objetivo}.`, 'info');
        return;
    }

    // 5. CONSTRUCCIÓN DEL MODAL (Inspirado en tu subtitle de ListTile)
    let ucTotal = 0;
    let htmlTabla = `
        <div style="max-height: 400px; overflow-y: auto;">
            <table style="width:100%; text-align:left; border-collapse:collapse; font-family: sans-serif;">
                <thead style="position: sticky; top: 0; background: #1A237E; color: white;">
                    <tr>
                        <th style="padding:12px;">Materia</th>
                        <th style="padding:12px; text-align:center;">Sem</th>
                        <th style="padding:12px; text-align:center;">Estado</th>
                    </tr>
                </thead>
                <tbody>`;
    
    sugeridas.forEach(m => {
        const hist = historialData.find(h => h.id_materia === m.id_materia);
        const esReprobada = hist && hist.estado === 'reprobado';
        const esArrastre = m.id_semestre < objetivo;
        
        // Definición de Colores y Etiquetas (Tu lógica de Flutter)
        let colorIcono = "#2196F3"; // Blue (POR CURSAR)
        let etiqueta = "POR CURSAR";

        if (esReprobada) {
            colorIcono = "#F44336"; // Red (REPROBADA)
            etiqueta = "REPROBADA";
        } else if (esArrastre) {
            colorIcono = "#FF9800"; // Orange (ARRASTRE)
            etiqueta = "ARRASTRE";
        }

        ucTotal += m.uc;

        htmlTabla += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding:12px;">
                    <div style="font-weight:bold; color: ${colorIcono};">${m.nombre.split(":")[0]}</div>
                    <div style="font-size:11px; color:#666;">UC: ${m.uc}</div>
                </td>
                <td style="padding:12px; text-align:center; font-weight:bold;">${m.id_semestre}</td>
                <td style="padding:12px; text-align:center;">
                    <span style="background:${colorIcono}22; color:${colorIcono}; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold;">
                        ${etiqueta}
                    </span>
                </td>
            </tr>`;
    });

    htmlTabla += `</tbody></table></div>
        <div style="margin-top:15px; text-align:right; font-size:1.1em;">
            <strong>Total Créditos: <span style="color:#1A237E">${ucTotal}</span></strong>
        </div>`;

    Swal.fire({
        title: 'Sugerencia de Inscripción',
        html: htmlTabla,
        width: '700px',
        confirmButtonColor: '#1A237E',
        confirmButtonText: 'Cerrar'
    });
}

// --- FUNCIONES DE APOYO PARA EL DISEÑO ---

function dibujarEncabezadoInstitucional(doc, titulo) {
    const azulUnefa = [26, 35, 126];
    
    // Encabezado de texto centrado
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("REPÚBLICA BOLIVARIANA DE VENEZUELA", 105, 15, { align: 'center' });
    doc.text("MINISTERIO DEL PODER POPULAR PARA LA DEFENSA", 105, 19, { align: 'center' });
    doc.setFontSize(9);
    doc.text("UNIVERSIDAD NACIONAL EXPERIMENTAL POLITÉCNICA", 105, 23, { align: 'center' });
    doc.setFontSize(8);
    doc.text("DE LA FUERZA ARMADA NACIONAL - NÚCLEO YARACUY", 105, 27, { align: 'center' });
    doc.text("SECRETARÍA - UNIDAD DE GESTIÓN EDUCATIVA", 105, 31, { align: 'center' });
    
    // Línea divisoria azul
    doc.setDrawColor(26, 35, 126);
    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35);

    // Cuadro de datos del estudiante (Rectángulo con bordes)
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(14, 38, 182, 18); 
    
    doc.setFontSize(8);
    doc.text(`NOMBRE Y APELLIDO: ${currentUser.nombre.toUpperCase()}`, 18, 45);
    doc.text(`CÉDULA: ${currentUser.cedula}`, 140, 45);
    doc.text(`CARRERA: ${currentUser.carrera.toUpperCase()}`, 18, 51);
    doc.text(`FECHA: ${new Date().toLocaleDateString()}`, 140, 51);

    // Título del documento
    doc.setFontSize(10);
    doc.setTextColor(26, 35, 126);
    doc.text(titulo, 105, 65, { align: 'center' });
    doc.setTextColor(0); // Reset a negro
}

function dibujarPieDePagina(doc) {
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(7);
    doc.setDrawColor(200);
    doc.line(14, pageHeight - 35, 196, pageHeight - 35);
    
    doc.setFont("helvetica", "bold");
    doc.text('UNEFA "Excelencia Educativa Abierta al Pueblo"', 105, pageHeight - 30, { align: 'center' });
    doc.setFontSize(6);
    doc.text("2006, AÑO DEL BICENTENARIO DEL JURAMENTO DEL GENERALÍSIMO FRANCISCO DE MIRANDA", 105, pageHeight - 26, { align: 'center' });
    
    doc.setFont("helvetica", "normal");
    doc.text("UNEFA Núcleo Yaracuy: Sector \"El Jobito\", calle Principal, antigua Casa Taller \"Cecilia Mujica\" del INAM. San Felipe, estado Yaracuy", 105, pageHeight - 22, { align: 'center' });
    doc.setFont("helvetica", "bold");
    doc.text("Telfs: (0254) - 231-7948 FAX: (0254) 232-5911", 105, pageHeight - 18, { align: 'center' });
    
    // Cuadro gris inferior de advertencia
    doc.setFillColor(245, 245, 245);
    doc.rect(14, pageHeight - 15, 182, 6, 'F');
    doc.setFontSize(6);
    doc.text("ESTE DOCUMENTO ES UNA GUÍA EMITIDA POR SIA-UNEFA. NO VÁLIDO SIN LA APROBACIÓN DE SU COORDINADOR DE CARRERA", 105, pageHeight - 11, { align: 'center' });
}

function generarPDFRecomendacion() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // 1. IDENTIFICAR EL SEMESTRE MÁXIMO APROBADO (Lógica idéntica al modal)
    let maxSem = 0;
    historialData.forEach(h => {
        if (h.estado === 'aprobado') {
            const materia = materiasData.find(m => m.id_materia === h.id_materia);
            if (materia && parseInt(materia.id_semestre) > maxSem) {
                maxSem = parseInt(materia.id_semestre);
            }
        }
    });

    // 2. DEFINIR EL OBJETIVO (maxSem + 1)
    const objetivo = maxSem + 1;

    // 3. FILTRAR Y PREPARAR DATOS (Mismo filtro estricto)
    const sugeridas = [];
    let ucTotal = 0;

    // Filtramos con las reglas de Flutter/Modal
    const candidatas = materiasData.filter(m => {
        const hist = historialData.find(h => h.id_materia === m.id_materia);
        const estado = hist ? hist.estado : 'no cursada';

        return estado !== 'aprobado' && 
               parseInt(m.id_semestre) > 0 && 
               checkPrelaciones(m.id_materia) && 
               parseInt(m.id_semestre) <= objetivo;
    });

    // Ordenar por semestre para que el PDF sea legible
    candidatas.sort((a, b) => a.id_semestre - b.id_semestre);

    candidatas.forEach(m => {
        const hist = historialData.find(h => h.id_materia === m.id_materia);
        const esReprobada = hist && hist.estado === 'reprobado';
        const esArrastre = parseInt(m.id_semestre) < objetivo;

        let textoEstado = "REGULAR";
        let colorRGB = [33, 150, 243]; // Azul Flutter (Regular)

        if (esReprobada) {
            textoEstado = "REPROBADA";
            colorRGB = [244, 67, 54]; // Rojo Flutter
        } else if (esArrastre) {
            textoEstado = "ARRASTRE";
            colorRGB = [255, 152, 0]; // Naranja Flutter
        }

        sugeridas.push({
            datos: [
                m.codigo, 
                m.nombre.split(":")[0].toUpperCase(), 
                m.id_semestre, 
                m.h_teoria || 0, 
                m.h_practica || 0, 
                m.uc, 
                textoEstado
            ],
            color: colorRGB,
            esEspecial: (esReprobada || esArrastre)
        });
        ucTotal += m.uc;
    });

    // 4. DIBUJAR ENCABEZADO
    dibujarEncabezadoInstitucional(doc, "PLANILLA DE PRE-INSCRIPCIÓN (SUGERIDA)");

    // 5. GENERAR TABLA
    doc.autoTable({
        startY: 75,
        head: [['CÓDIGO', 'ASIGNATURA', 'SEM', 'HT', 'HP', 'UC', 'ESTADO']],
        body: sugeridas.map(s => s.datos),
        theme: 'grid',
        headStyles: { 
            fillColor: [26, 35, 126], 
            textColor: 255, 
            fontStyle: 'bold', 
            fontSize: 8,
            halign: 'center'
        },
        styles: { 
            fontSize: 7, 
            cellPadding: 2,
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0] // Por defecto negro
        },
        columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && sugeridas[data.row.index]) {
                const item = sugeridas[data.row.index];
                // Aplicar el color correspondiente al texto de la fila
                data.cell.styles.textColor = item.color;
                
                // Si no es regular, poner en negrita para resaltar
                if (item.esEspecial) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        }
    });

    // 6. PIE DE TABLA Y PÁGINA
    const finalY = doc.lastAutoTable.finalY || 75;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0); // Volver a negro para el total
    doc.text(`Total Unidades de Crédito Sugeridas: ${ucTotal}`, 196, finalY + 10, { align: 'right' });

    dibujarPieDePagina(doc);
    
    // 7. GUARDAR
    doc.save(`Planilla_Sugerida_${currentUser.cedula}.pdf`);
}

// --- 1. GENERAR RÉCORD ACADÉMICO ---
function generarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    dibujarEncabezadoInstitucional(doc, "LISTADO DE ASIGNATURAS APROBADAS");

    const aprobadas = materiasData.filter(m => 
        historialData.some(h => h.id_materia === m.id_materia && h.estado === 'aprobado')
    ).sort((a, b) => a.id_semestre - b.id_semestre);

    const body = aprobadas.map(m => [
        m.id_semestre, 
        m.codigo, 
        (m.nombre_elegida || m.nombre.split(":")[0]).toUpperCase(), 
        m.uc
    ]);
    
    const totalUC = aprobadas.reduce((sum, m) => sum + m.uc, 0);

    doc.autoTable({
        startY: 75,
        head: [['SEM', 'CÓDIGO', 'ASIGNATURA', 'UC']],
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [26, 35, 126], textColor: 255, fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2 }
    });

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL UNIDADES DE CRÉDITO APROBADAS: ${totalUC}`, 196, doc.lastAutoTable.finalY + 10, { align: 'right' });

    dibujarPieDePagina(doc);
    doc.save(`Record_Academico_${currentUser.cedula}.pdf`);
}
/**
 * Calcula el semestre más alto que el alumno ha aprobado completamente.
 */
function calcularSemestreMaxAprobado() {
    if (!materiasData || !historialData) return 0;
    
    const aprobadas = materiasData.filter(m => 
        historialData.some(h => h.id_materia === m.id_materia && h.estado === 'aprobado')
    );
    
    if (aprobadas.length === 0) return 0;
    
    // Retorna el número de semestre más alto encontrado en las aprobadas
    return Math.max(...aprobadas.map(m => m.id_semestre));
}

/**
 * Función auxiliar para dibujar el encabezado (Evita errores de referencia)
 */
function dibujarEncabezadoInstitucional(doc, titulo) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("REPÚBLICA BOLIVARIANA DE VENEZUELA", 105, 15, { align: 'center' });
    doc.text("MINISTERIO DEL PODER POPULAR PARA LA DEFENSA", 105, 19, { align: 'center' });
    doc.setFontSize(9);
    doc.text("UNIVERSIDAD NACIONAL EXPERIMENTAL POLITÉCNICA", 105, 23, { align: 'center' });
    doc.setFontSize(8);
    doc.text("DE LA FUERZA ARMADA NACIONAL - NÚCLEO YARACUY", 105, 27, { align: 'center' });
    
    doc.setDrawColor(26, 35, 126);
    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35);

    // Cuadro de datos
    doc.setDrawColor(0);
    doc.rect(14, 38, 182, 18); 
    doc.setFontSize(8);
    doc.text(`NOMBRE: ${currentUser ? currentUser.nombre.toUpperCase() : 'N/P'}`, 18, 45);
    doc.text(`CÉDULA: ${currentUser ? currentUser.cedula : 'N/P'}`, 140, 45);
    doc.text(`CARRERA: ${currentUser ? currentUser.carrera.toUpperCase() : 'N/P'}`, 18, 51);

    doc.setFontSize(10);
    doc.setTextColor(26, 35, 126);
    doc.text(titulo, 105, 65, { align: 'center' });
    doc.setTextColor(0);
}

/**
 * Función auxiliar para el pie de página
 */
function dibujarPieDePagina(doc) {
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(7);
    doc.text('UNEFA "Excelencia Educativa Abierta al Pueblo"', 105, pageHeight - 20, { align: 'center' });
}

// Ejemplo de ajuste en app.js para la sugerencia
Swal.fire({
    title: 'Sugerencia de Inscripción',
    html: htmlSugerencia,
    width: window.innerWidth > 768 ? '600px' : '95%', // Ancho dinámico
    confirmButtonText: 'Entendido'
});