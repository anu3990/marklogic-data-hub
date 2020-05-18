import React, { useContext, useState, useEffect } from 'react';
import { MLTable } from '@marklogic/design-system';
import QueryExport from "../query-export/query-export";
import { AuthoritiesContext } from "../../util/authorities";
import styles from './results-tabular-view.module.scss';
import ColumnSelector from '../../components/column-selector/column-selector';
import { Tooltip } from 'antd';
import { SearchContext } from '../../util/search-context';
import { tableParser } from '../../util/data-conversion';
import { Link } from 'react-router-dom';
import { faExternalLinkAlt, faCode } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { dateConverter } from '../../util/date-conversion';
import { MLTooltip } from '@marklogic/design-system';

interface Props {
    data: any;
    entityPropertyDefinitions: any[];
    selectedPropertyDefinitions: any[];
    columns: any;
    hasStructured: boolean;
    tableView: boolean;
}

const DEFAULT_ALL_ENTITIES_HEADER = [
    {
        title: 'Identifier',
        dataIndex: 'identifier',
        key: '0-i',
        visible: true,
        width: 150
    },
    {
        title: 'Entity',
        dataIndex: 'entityName',
        key: '0-1',
        visible: true,
        width: 150
    },
    {
        title: 'File Type',
        key: '0-2',
        dataIndex: 'fileType',
        visible: true,
        width: 150
    },
    {
        title: 'Created',
        dataIndex: 'createdOn',
        key: '0-c',
        visible: true,
        width: 150
    },
    {
        title: 'Detail View',
        dataIndex: 'detailView',
        key: '0-d',
        visible: true,
        width: 150
    }
];

const ResultsTabularView = (props) => {


    const [popoverVisibility, setPopoverVisibility] = useState<boolean>(false);

    const {
        searchOptions,
        setSelectedTableProperties,
    } = useContext(SearchContext);

    const authorityService = useContext(AuthoritiesContext);
    const canExportQuery = authorityService.canExportEntityInstances();
    let counter = 0;
    let parsedPayload = tableParser(props);

    let selectedTableColumns = props.selectedPropertyDefinitions;

    const generateTableDataWithSelectedColumns = (item, dataObj = {}) => {
        if (item) {
            for (let subItem of item) {
                if (!Array.isArray(subItem)) {
                    if (!subItem.hasOwnProperty('properties')) {
                        dataObj[subItem.propertyPath] = "";
                    } else {
                        let dataObjArr: any[] = [];
                        if(subItem.properties) {
                            dataObjArr.push(generateTableDataWithSelectedColumns(subItem.properties));
                        }
                        
                        dataObj[subItem.propertyPath] = dataObjArr;
                    }
                } else {
                    return generateTableDataWithSelectedColumns(subItem)
                }
            }
            return dataObj;
        }
    }
    
    let dataWithSelectedTableColumns = generateTableDataWithSelectedColumns(props.selectedPropertyDefinitions);

    const tableHeaderRender = (selectedTableColumns) => {
        const columns = selectedTableColumns.map((item) => {
            if (!item.hasOwnProperty('properties')) {
                return {
                    dataIndex: item.propertyPath,
                    key: item.propertyPath,
                    title: item.propertyLabel,
                    type: item.datatype,
                    onCell: () => {
                        return {
                            style: {
                                whiteSpace: 'nowrap',
                                maxWidth: 150,
                            }
                        }
                    },
                    render: (value) => {
                        if (Array.isArray(value)) {
                            let values = new Array();
                            value.forEach(item => {
                                if (item) {
                                    let title = item.toString();
                                    if (title && title.length > 0) {
                                        values.push(
                                            <MLTooltip
                                                title={title}>
                                                <div style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{item}</div>
                                            </MLTooltip>
                                        )
                                    }
                                }
                            })
                            return {
                                children: values
                            }
                        } else {
                            if (value) {
                                return {
                                    children: (
                                        <MLTooltip
                                            title={value}>
                                            <div style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{value}</div>
                                        </MLTooltip>
                                    )
                                }
                            }
                        }
                    },
                }
            } else {
                return {
                    dataIndex: item.propertyPath,
                    key: item.propertyPath,
                    title: item.propertyLabel,
                    type: item.datatype,
                    columns: tableHeaderRender(item.properties)
                }
            }
        })
        return columns;
    }


    const updatedTableHeader = () => {
        let header = tableHeaderRender(selectedTableColumns);
        let detailView = {
            title: 'Detail View',
            dataIndex: 'detailView',
            key: '0-d'
        }
        header.push(detailView);
        return header;
    }

    const tableHeaders = props.selectedEntities?.length === 0 ? DEFAULT_ALL_ENTITIES_HEADER : updatedTableHeader();


    const tableDataRender = (item) => {
        let dataObj = {};
        let primaryKeyValue = item.primaryKey?.propertyValue;
        let isUri = item.primaryKey?.propertyPath === 'uri';
        let uri = encodeURIComponent(item.uri);
        let path = { pathname: `/tiles/explore/detail/${isUri ? '-' : encodeURIComponent(primaryKeyValue)}/${uri}` };
        let options = {};
        let detailView =
            <div className={styles.redirectIcons}>
                <Link to={{ pathname: `${path.pathname}`, state: { selectedValue: 'instance',
                        entity : searchOptions.entityTypeIds ,
                        pageNumber : searchOptions.pageNumber,
                        start : searchOptions.start,
                        searchFacets : searchOptions.selectedFacets,
                        query: searchOptions.query,
                        tableView: props.tableView
                    }}} id={'instance'}
                    data-cy='instance'>
                    <Tooltip title={'Show detail on a separate page'}><FontAwesomeIcon icon={faExternalLinkAlt} size="sm" data-testid={`${primaryKeyValue}-detailOnSeparatePage`} /></Tooltip>
                </Link>
                <Link to={{ pathname: `${path.pathname}`,
                    state: { selectedValue: 'source',
                        entity : searchOptions.entityTypeIds ,
                        pageNumber : searchOptions.pageNumber,
                        start : searchOptions.start,
                        searchFacets : searchOptions.selectedFacets,
                        query: searchOptions.query,
                        tableView: props.tableView
                    } }} id={'source'}
                    data-cy='source'>
                    <Tooltip title={'Show source on a separate page'}><FontAwesomeIcon icon={faCode} size="sm" data-testid={`${primaryKeyValue}-sourceOnSeparatePage`} /></Tooltip>
                </Link>
            </div>
        if (props.selectedEntities?.length === 0) {
            let itemIdentifier = item.identifier?.propertyValue;
            let itemEntityName = item.entityName;
            let document = item.uri.split('/')[item.uri.split('/').length - 1];
            let createdOn = item.createdOn;
            options = {
                primaryKey: primaryKeyValue,
                identifier: <Tooltip title={isUri && item.uri}>{isUri ? '.../' + document : itemIdentifier}</Tooltip>,
                entityName: <span data-testid={`${itemEntityName}-${primaryKeyValue}`}>{itemEntityName}</span>,
                fileType: <span data-testid={`${item.format}-${primaryKeyValue}`}>{item.format}</span>,
                createdOn: dateConverter(createdOn),
                uri: item.uri,
                primaryKeyPath: path,
                detailView: detailView
            }
        } else {
            options = {
                primaryKey: primaryKeyValue,
                uri: item.uri,
                primaryKeyPath: path,
                detailView: detailView
            }
        }

        dataObj = { ...dataObj, ...options };
        if (item?.hasOwnProperty('entityProperties')) {
            if(JSON.stringify(item.entityProperties) !== JSON.stringify([])){
                generateTableData(item.entityProperties, dataObj)
            } else {
                dataObj = { ...dataObj, ...dataWithSelectedTableColumns };
            }
        }

        return dataObj;
    }

    const generateTableData = (item, dataObj = {}) => {
        if (item) {
            for (let subItem of item) {
                if (!Array.isArray(subItem)) {
                    if (!Array.isArray(subItem.propertyValue) || subItem.propertyValue[0] === null || typeof (subItem.propertyValue[0]) !== 'object') {
                        dataObj[subItem.propertyPath] = subItem.propertyValue;
                    } else {
                        let dataObjArr: any[] = [];
                        for (let el of subItem.propertyValue) {
                            if (el) {
                                dataObjArr.push(generateTableData(el));
                            }
                        }
                        dataObj[subItem.propertyPath] = dataObjArr;
                    }
                } else {
                    return generateTableData(subItem)
                }
            }
            return dataObj;
        }
    }

    const dataSource = props.data.map((item) => {
        return tableDataRender(item);
    });

    useEffect(() => {
        if (props.columns && props.columns.length > 0 && searchOptions.selectedTableProperties.length === 0) {
            setSelectedTableProperties(props.columns)
        }
    }, [props.columns])
    const expandedRowRender = (rowId) => {

        const nestedColumns = [
            { title: 'Property', dataIndex: 'property', width: '33%' },
            { title: 'Value', dataIndex: 'value', width: '34%' },
            { title: 'View', dataIndex: 'view', width: '33%' },
        ];

        let nestedData: any[] = [];
        const parseJson = (obj: Object) => {
            let parsedData = new Array();
            for (var i in obj) {
                if (obj[i] !== null && typeof (obj[i]) === "object") {
                    parsedData.push({
                        key: counter++,
                        property: i,
                        children: parseJson(obj[i]),
                        view: <Link to={{ pathname: `${rowId.primaryKeyPath.pathname}`, state: { id: obj[i],
                                entity : searchOptions.entityTypeIds,
                                pageNumber : searchOptions.pageNumber,
                                start : searchOptions.start,
                                searchFacets : searchOptions.selectedFacets,
                                query: searchOptions.query,
                                tableView: props.tableView} }}
                            data-cy='nested-instance'>
                            <Tooltip title={'Show nested detail on a separate page'}><FontAwesomeIcon icon={faExternalLinkAlt}
                                size="sm" /></Tooltip>
                        </Link>
                    });
                } else {
                    parsedData.push({
                        key: counter++,
                        property: i,
                        value: typeof obj[i] === 'boolean' ? obj[i].toString() : obj[i],
                        view: null
                    });
                }
            }
            return parsedData;
        }

        let index: string = '';
        for (let i in parsedPayload.data) {
            if (parsedPayload.data[i].uri == rowId.uri) {
                index = i;
            }
        }

        nestedData = parseJson(parsedPayload.data[index]?.itemEntityProperties[0]);

        return <MLTable
            rowKey="key"
            columns={nestedColumns}
            dataSource={nestedData}
            pagination={false}
            className={styles.nestedTable}
        />
    }

    return (
        <>
            <div className={styles.icon}>
                <div className={styles.queryExport}>
                    {canExportQuery && <QueryExport hasStructured={props.hasStructured} columns={props.columns} />}
                </div>
                {props.selectedEntities?.length !== 0 ? <div className={styles.columnSelector} data-cy="column-selector">
                    <ColumnSelector popoverVisibility={popoverVisibility} setPopoverVisibility={setPopoverVisibility} entityPropertyDefinitions={props.entityPropertyDefinitions} selectedPropertyDefinitions={props.selectedPropertyDefinitions} setColumnSelectorTouched={props.setColumnSelectorTouched} columns={props.columns} />
                </div> : ''}

            </div>
            <div className={styles.tabular}>
                <MLTable bordered
                    data-testid='result-table'
                    rowKey='uri'
                    dataSource={dataSource}
                    columns={tableHeaders}
                    expandedRowRender={expandedRowRender}
                    pagination={false}
                />
            </div>
        </>
    )
}

export default ResultsTabularView