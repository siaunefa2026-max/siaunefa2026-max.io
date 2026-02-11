/**
 * Genera el Récord Académico en PDF
 * Utiliza las variables globales 'materias' e 'historial' de app.js
 */
function generarRecordPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Configuración de encabezado
    doc.setFillColor(26, 35, 126); // Azul UNEFA
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text("UNIVERSIDAD NACIONAL EXPERIMENTAL POLITÉCNICA", 105, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text("DE LA FUERZA ARMADA NACIONAL (UNEFA)", 105, 25, { align: 'center' });
    doc.setFontSize(12);
    doc.text("RÉCORD ACADÉMICO DIGITAL", 105, 35, { align: 'center' });

    // Datos del Estudiante (puedes dinamizar esto con los datos de Supabase Auth)
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, 15, 50);
    doc.text(`ID Estudiante: ${userId || 'No identificado'}`, 15, 55);

    // Preparar datos para la tabla
    // Filtramos solo las materias que tienen algún estado registrado
    const filas = materias.map(m => {
        const estado = historial[m.id_materia] || 'No cursada';
        return [
            m.id_semestre + "°",
            m.codigo,
            m.nombre,
            estado.toUpperCase()
        ];
    });

    // Generar Tabla
    doc.autoTable({
        startY: 65,
        head: [['Sem', 'Código', 'Asignatura', 'Estatus']],
        body: filas,
        headStyles: { fillColor: [26, 35, 126] },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        styles: { fontSize: 9 },
        columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 25 },
            3: { fontStyle: 'bold' }
        },
        didDrawCell: (data) => {
            // Pintar el texto de color según el estatus
            if (data.section === 'body' && data.column.index === 3) {
                const txt = data.cell.raw;
                if (txt === 'APROBADO') doc.setTextColor(76, 175, 80);
                if (txt === 'REPROBADO') doc.setTextColor(244, 67, 54);
            }
        }
    });

    // Pie de página
    const totalAprobadas = Object.values(historial).filter(v => v === 'aprobado').length;
    doc.setFontSize(11);
    doc.text(`Total Asignaturas Aprobadas: ${totalAprobadas}`, 15, doc.lastAutoTable.finalY + 15);

    // Descargar
    doc.save(`Record_Academico_${new Date().getTime()}.pdf`);
}